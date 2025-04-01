/**
 * Handler for tool calls (tools/functions) from LLM models.
 * Includes argument parsing, schema validation, security checks
 * and execution of the corresponding `execute` function.
 */

import { Message, Tool, ToolCall, UserAuthInfo, ToolContext, OpenRouterRequestOptions } from './types';
import { ExtendedToolCallEvent } from './security/types';
import {
    mapError,
    OpenRouterError,
    ToolError,
    ValidationError,
    ErrorCode,
    AccessDeniedError,
    AuthorizationError,
    SecurityError,
    RateLimitError
} from './utils/error';
import * as jsonUtils from './utils/json-utils';
import type { SecurityManager } from './security/security-manager';
import { Logger } from './utils/logger';
import { OpenRouterClient } from './client';

// Define the expected return type for the handler
interface ToolHandlerResult {
    toolResultsMessages: Message[];
    finalResponse: any;
}

type ClientForTools = Pick<OpenRouterClient, 'chat'>;

/**
 * @internal
 */
interface InternalToolHandlerParams {
  message: Message & { tool_calls: ToolCall[] };
  debug: boolean;
  tools: Tool[];
  securityManager?: SecurityManager;
  userInfo: UserAuthInfo | null;
  logger: Logger;
  parallelCalls?: boolean;
}

/**
 * @internal
 * Core logic for handling tool calls. Executes tools and prepares
 * the corresponding 'tool' role messages with results or errors.
 */
async function _internalHandleToolCalls(params: InternalToolHandlerParams): Promise<Message[]> {
  const {
    message,
    tools = [],
    securityManager,
    userInfo,
    logger,
    parallelCalls = true,
  } = params;

  if (!message.tool_calls || message.tool_calls.length === 0) {
     logger.warn('[_internalHandleToolCalls] Called without tool_calls. Returning empty array.');
     return [];
  }

  const toolCalls = message.tool_calls;

  logger.log(`Starting execution of ${toolCalls.length} tool calls (Mode: ${parallelCalls ? 'parallel' : 'sequential'})...`);

  const processToolCall = async (toolCall: ToolCall): Promise<Message> => {
      const toolCallStartTime = Date.now();
      let toolResultContent: string;
      let success = false;
      let executionError: OpenRouterError | Error | undefined;
      let parsedArgs: any = null;
      const toolLogDetails: Record<string, any> = { tool_call_id: toolCall.id };

      const toolName = toolCall.function?.name || '<name not found>';
      toolLogDetails.name = toolName;
      logger.debug(`Processing tool call: ${toolName} (ID: ${toolCall.id})`);

      try {
          const { id: toolCallId, function: funcCall } = toolCall;
          const { arguments: argsString } = funcCall;
          toolLogDetails.rawArgs = argsString;

          const toolDefinition = tools.find(t => t.type === 'function' && (t.function.name === toolName || t.name === toolName));
          if (!toolDefinition) {
              throw new ToolError(`Tool '${toolName}' is not defined or not provided in the 'tools' array.`);
          }
          const executeFunction = toolDefinition.execute ?? toolDefinition.function?.execute;
          if (!executeFunction || typeof executeFunction !== 'function') {
              throw new ToolError(`'execute' function not found or not a function for tool '${toolName}'.`);
          }
          toolLogDetails.definitionFound = true;

          try {
              logger.debug(`Parsing arguments for '${toolName}': ${argsString}`);
              // Use the corrected parseOrThrow, which treats "" as {} for arguments
              parsedArgs = jsonUtils.parseOrThrow(argsString, `tool '${toolName}' arguments`, { logger });
              toolLogDetails.parsedArgs = parsedArgs;

              const schema = toolDefinition.function?.parameters;
              if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) {
                   logger.debug(`Validating arguments for '${toolName}' against JSON schema...`);
                   jsonUtils.validateJsonSchema(parsedArgs, schema, `tool '${toolName}' arguments`, { logger });
                   toolLogDetails.argsSchemaValid = true;
                   logger.debug(`Arguments for '${toolName}' passed schema validation.`);
              } else {
                  logger.debug(`JSON schema for '${toolName}' not provided or empty, validation skipped.`);
                  toolLogDetails.argsSchemaValid = null;
              }
          } catch (validationOrParsingError) {
              logger.warn(`Error parsing/validating arguments for '${toolName}': ${(validationOrParsingError as Error).message}`);
              toolLogDetails.argsSchemaValid = false;
              toolLogDetails.validationError = (validationOrParsingError as Error).message;
              throw validationOrParsingError;
          }

          if (securityManager) {
              logger.debug(`Performing security checks for '${toolName}', user: ${userInfo?.userId || 'anonymous'}`);
              try {
                  await securityManager.checkToolAccessAndArgs(toolDefinition, userInfo || null, parsedArgs);
                  toolLogDetails.accessGranted = true;
                  toolLogDetails.rateLimitPassed = true;
                  toolLogDetails.argsSanitized = true;
                  logger.log(`Security checks passed for '${toolName}' (User: ${userInfo?.userId || 'anonymous'}).`);
              } catch (securityError) {
                   logger.warn(`Security check for '${toolName}' failed: ${(securityError as Error).message}`);
                   const mappedSecError = mapError(securityError);
                   toolLogDetails.accessGranted = !(mappedSecError instanceof AccessDeniedError || mappedSecError instanceof AuthorizationError);
                   toolLogDetails.rateLimitPassed = !(mappedSecError instanceof RateLimitError);
                   toolLogDetails.argsSanitized = !(mappedSecError instanceof SecurityError && mappedSecError.code === ErrorCode.DANGEROUS_ARGS);
                   toolLogDetails.securityError = mappedSecError.message;
                   toolLogDetails.securityErrorCode = mappedSecError.code;
                  throw securityError;
              }
          } else {
              logger.debug(`SecurityManager not configured, security checks for '${toolName}' skipped.`);
              toolLogDetails.accessGranted = null;
              toolLogDetails.rateLimitPassed = null;
              toolLogDetails.argsSanitized = null;
          }

          const toolContext: ToolContext = { userInfo: userInfo || undefined, securityManager: securityManager || undefined };
          logger.debug(`Executing function for ${toolName}...`);
          let toolRawResult: any;
          try {
              toolRawResult = await executeFunction(parsedArgs, toolContext);
              success = true;
              toolLogDetails.executionSuccess = true;
              logger.debug(`Execution of ${toolName} completed successfully.`);
              logger.debug(`Raw result from ${toolName}:`, toolRawResult);
          } catch (execError) {
              success = false;
              executionError = mapError(execError);
              toolLogDetails.executionSuccess = false;
              toolLogDetails.executionError = executionError.message;
              const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
              logger.error(`Error executing function for ${toolName}: ${executionError.message}`, errorDetails || executionError);
          } finally {
              const duration = Date.now() - toolCallStartTime;
              toolLogDetails.durationMs = duration;
              logger.log(`Call to ${toolName} ${success ? 'completed successfully' : 'failed'} in ${duration} ms.`);
              if (securityManager) {
                  const event: ExtendedToolCallEvent = {
                      toolName,
                      userId: userInfo?.userId || 'anonymous',
                      args: parsedArgs,
                      result: success ? toolRawResult : { error: executionError?.message },
                      success,
                      error: executionError instanceof Error ? executionError : undefined,
                      timestamp: toolCallStartTime,
                      duration: duration,
                  };
                  try {
                      securityManager.logToolCall(event);
                  } catch (logError) {
                       logger.error(`Error logging ${toolName} call via SecurityManager:`, logError);
                  }
              }
          }

          if (success) {
              // Stringify successful result
              toolResultContent = jsonUtils.stringifyOrThrow(toolRawResult ?? null, `tool ${toolName} result`, { logger });
          } else {
              // Format error as a descriptive string instead of JSON
              toolResultContent = `Error executing tool '${toolName}': ${executionError?.message || 'Unknown execution error'}`;
              logger.warn(`Formatted error result for LLM for tool ${toolName}: ${toolResultContent}`);
          }
          logger.debug(`Result formatted for LLM (tool_call_id: ${toolCallId}): ${toolResultContent.substring(0, 200)}...`);

      } catch (error) { // Catches errors before execution (parsing, validation, security)
          const mappedError = mapError(error);
          executionError = mappedError;
          success = false;
          const currentToolName = toolLogDetails.name || toolCall.function?.name || '<unknown tool>';
          const errorMessage = executionError.message || `Unknown error processing call for ${currentToolName}`;
           const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
          logger.error(`Error processing ${currentToolName} call (ID: ${toolCall.id}) before execution: ${errorMessage}`, errorDetails || executionError);

          // Format error as a descriptive string for the LLM
          toolResultContent = `Error processing tool call '${currentToolName}': ${errorMessage}`;
          logger.warn(`Formatted pre-execution error result for LLM for tool ${currentToolName}: ${toolResultContent}`);

          toolLogDetails.criticalError = errorMessage;
          toolLogDetails.criticalErrorCode = executionError instanceof OpenRouterError ? executionError.code : undefined;
          toolLogDetails.criticalErrorDetails = errorDetails;
      }

      return {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultContent, // Content is now always a string
      };
  };

  let toolResultsMessages: Message[];
  try {
      if (parallelCalls) {
          logger.debug("Executing tool calls in parallel...");
          toolResultsMessages = await Promise.all(toolCalls.map(processToolCall));
      } else {
          logger.debug("Executing tool calls sequentially...");
          toolResultsMessages = [];
          for (const toolCall of toolCalls) {
              const resultMessage = await processToolCall(toolCall);
              toolResultsMessages.push(resultMessage);
          }
      }
  } catch (error) {
      const mappedError = mapError(error);
      logger.error(`Unexpected error during batch tool call processing: ${mappedError.message}`, mappedError);
      throw mappedError;
  }

  logger.log(`Execution of ${toolCalls.length} tool calls completed.`);

  return toolResultsMessages;
}

/**
 * Static helper class for working with tools (functions/tools).
 */
export class ToolHandler {
  /**
   * @internal
   * Static entry point called by `OpenRouterClient`.
   * Executes requested tool calls and returns messages with results.
   */
  static async handleToolCalls(params: InternalToolHandlerParams): Promise<Message[]> {
    return _internalHandleToolCalls(params);
  }

  /**
   * Formats a tool definition provided by the user into the standard format
   * expected by the OpenRouter/OpenAI API (`{ type: 'function', function: {...} }`).
   * Does NOT add default parameters if none are provided.
   */
  static formatToolForAPI(toolInput: Record<string, any> | Tool): Tool {
    if (!toolInput || typeof toolInput !== 'object') {
        throw new ValidationError('Invalid tool object: expected an object.');
    }

    // Case 1: Already in the correct format { type: 'function', function: {...} }
    if ('type' in toolInput && toolInput.type === 'function' && 'function' in toolInput && typeof toolInput.function === 'object' && toolInput.function !== null) {
        const func = toolInput.function;
        if (!('name' in func) || typeof func.name !== 'string' || func.name === '') {
            throw new ValidationError(`Tool validation error: 'function.name' (string) is required.`);
        }
        // Validate parameters if they exist
        if ('parameters' in func && func.parameters && (typeof func.parameters !== 'object' || func.parameters === null || Array.isArray(func.parameters))) {
            throw new ValidationError(`Tool '${func.name}': 'function.parameters' must be a JSON Schema object if provided.`);
        }
         if ('description' in func && typeof func.description !== 'string') {
             throw new ValidationError(`Tool '${func.name}': 'function.description' must be a string if provided.`);
         }

        // Return a clean version, ensuring execute/security are at the top level if they exist there
        const tool = toolInput as Tool;
        const formattedFunction: Tool['function'] = {
            name: func.name,
            ...(func.description && { description: func.description }),
            ...(func.parameters && { parameters: func.parameters }), // Include parameters only if they exist
        };

        return {
            type: 'function',
            function: formattedFunction,
             // Keep execute/security at top level if they were there
             ...(toolInput.execute && typeof toolInput.execute === 'function' && { execute: toolInput.execute }),
             ...(toolInput.security && typeof toolInput.security === 'object' && toolInput.security !== null && { security: toolInput.security }),
             // Include name at top level if it was there (for simplified format consistency)
             ...(toolInput.name && typeof toolInput.name === 'string' && { name: toolInput.name }),
        };
    }

    // Case 2: Simplified format { name: '...', parameters?: {...}, ... }
    if ('name' in toolInput && typeof toolInput.name === 'string' && toolInput.name.length > 0) {
        const legacyTool = toolInput as any;
        const toolName = legacyTool.name;

        // Validate parameters if they exist
        if ('parameters' in legacyTool && legacyTool.parameters && (typeof legacyTool.parameters !== 'object' || legacyTool.parameters === null || Array.isArray(legacyTool.parameters))) {
            throw new ValidationError(`Tool '${toolName}' (simplified format): 'parameters' field must be a JSON Schema object if provided.`);
        }
        if ('description' in legacyTool && typeof legacyTool.description !== 'string') {
             throw new ValidationError(`Tool '${toolName}' (simplified format): 'description' must be a string if provided.`);
         }
         if ('execute' in legacyTool && typeof legacyTool.execute !== 'function') {
             throw new ValidationError(`Tool '${toolName}' (simplified format): 'execute' must be a function if provided.`);
         }
         if ('security' in legacyTool && legacyTool.security && (typeof legacyTool.security !== 'object' || legacyTool.security === null)) {
             throw new ValidationError(`Tool '${toolName}' (simplified format): 'security' must be an object if provided.`);
         }

        // Build the function definition dynamically
        const functionDefinition: Tool['function'] = {
          name: toolName,
          description: legacyTool.description || '',
        };
        // Add 'parameters' ONLY if it exists in the input
        if (legacyTool.parameters) {
            functionDefinition.parameters = legacyTool.parameters;
        }

        const formattedTool: Tool = {
          type: 'function',
          function: functionDefinition, // Use the dynamically built definition
          ...(legacyTool.execute && { execute: legacyTool.execute }),
          ...(legacyTool.security && { security: legacyTool.security }),
           name: toolName, // Keep name at top level for consistency
        };
        return formattedTool;
    }

    // If neither format matches
    throw new ValidationError('Failed to recognize tool format: requires `type: "function"` and a `function` object, or a top-level `name` (string) for simplified format.');
  }
}