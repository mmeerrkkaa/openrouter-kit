/**
 * Handler for tool calls (tools/functions) from LLM models.
 * Includes argument parsing, schema validation, security checks
 * and execution of the corresponding `execute` function.
 */

import { Message, Tool, ToolCall, UserAuthInfo, ToolContext } from './types';
// Using extended event type from security module
import { ExtendedToolCallEvent } from './security/types';
import {
    mapError,
    OpenRouterError,
    ToolError,
    ValidationError,
} from './utils/error';
import * as jsonUtils from './utils/json-utils';
import type { SecurityManager } from './security/security-manager';
import { Logger } from './utils/logger';
import type { OpenRouterClient } from './client';

type ClientForTools = Pick<OpenRouterClient, 'chat'>;

/**
 * @internal
 */
interface InternalToolHandlerParams {
  message: Message & { tool_calls: ToolCall[] };
  messages: Message[];
  client: ClientForTools;
  debug: boolean;
  tools: Tool[];
  securityManager?: SecurityManager;
  userInfo: UserAuthInfo | null;
  logger: Logger;
  parallelCalls?: boolean;
}

/**
 * @internal
 */
async function _internalHandleToolCalls(params: InternalToolHandlerParams): Promise<string> {
  const {
    message,
    messages,
    client,
    tools = [],
    securityManager,
    userInfo,
    logger,
    parallelCalls = true
  } = params;

  if (!message.tool_calls || message.tool_calls.length === 0) {
     logger.warn('[_internalHandleToolCalls] Called without tool_calls. Returning empty result.');
     return '';
  }

  const toolCalls = message.tool_calls;
  const currentMessages: Message[] = [...messages, message];

  logger.log(`Starting processing of ${toolCalls.length} tool calls (Mode: ${parallelCalls ? 'parallel' : 'sequential'})...`);

  const processToolCall = async (toolCall: ToolCall): Promise<Message> => {
      const toolCallStartTime = Date.now();
      let toolResultContent: string;
      let success = false;
      let executionError: OpenRouterError | Error | undefined; // Can be our error or standard
      const toolLogDetails: Record<string, any> = { tool_call_id: toolCall.id };

      const toolName = toolCall.function?.name || '<name not found>';
      toolLogDetails.name = toolName;
      logger.debug(`Processing tool call: ${toolName} (ID: ${toolCall.id})`);

      try {
          const { id: toolCallId, function: funcCall } = toolCall;
          const { arguments: argsString } = funcCall;

          const toolDefinition = tools.find(t => t.type === 'function' && t.function.name === toolName);
          if (!toolDefinition) {
              throw new ToolError(`Tool '${toolName}' is not defined.`);
          }
          const executeFunction = toolDefinition.execute ?? toolDefinition.function?.execute;
          if (!executeFunction || typeof executeFunction !== 'function') {
              throw new ToolError(`Execute function not found for '${toolName}'.`);
          }
          toolLogDetails.definitionFound = true;

          let parsedArgs: any;
          try {
              logger.debug(`Parsing arguments for '${toolName}': ${argsString}`);
              parsedArgs = jsonUtils.parseOrThrow(argsString, `tool '${toolName}' arguments`, { logger });
              toolLogDetails.parsedArgs = parsedArgs;

              const schema = toolDefinition.function?.parameters;
              if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) {
                   logger.debug(`Validating arguments for '${toolName}' against JSON schema...`);
                   jsonUtils.validateJsonSchema(parsedArgs, schema, `tool '${toolName}' arguments`, { logger });
                   toolLogDetails.argsSchemaValid = true;
                   logger.debug(`Arguments for '${toolName}' passed schema validation.`);
              } else {
                  logger.debug(`JSON schema for '${toolName}' not provided, validation skipped.`);
                  toolLogDetails.argsSchemaValid = null;
              }
          } catch (validationOrParsingError) {
              logger.warn(`Error parsing/validating arguments for '${toolName}': ${(validationOrParsingError as Error).message}`);
              toolLogDetails.argsSchemaValid = false;
              toolLogDetails.validationError = (validationOrParsingError as Error).message;
              throw validationOrParsingError;
          }

          if (securityManager) {
              logger.debug(`Security check for '${toolName}', user: ${userInfo?.userId || 'anonymous'}`);
              try {
                  await securityManager.checkToolAccessAndArgs(toolDefinition, userInfo || null, parsedArgs);
                  toolLogDetails.accessGranted = true;
                  toolLogDetails.argsSanitized = true;
                  logger.log(`Access to '${toolName}' granted and arguments sanitized for ${userInfo?.userId || 'anonymous'}`);
              } catch (securityError) {
                  logger.warn(`Security check for '${toolName}' failed: ${(securityError as Error).message}`);
                  // Use instanceof for more precise determination of cause
                  toolLogDetails.accessGranted = !(securityError instanceof ToolError);
                  toolLogDetails.argsSanitized = !(securityError instanceof ToolError);
                  toolLogDetails.securityError = (securityError as Error).message;
                  throw securityError;
              }
          } else {
              logger.debug(`SecurityManager not configured, security check for '${toolName}' skipped.`);
              toolLogDetails.accessGranted = null;
              toolLogDetails.argsSanitized = null;
          }

          const toolContext: ToolContext = { userInfo: userInfo || undefined, securityManager: securityManager || undefined };
          logger.debug(`Executing function for ${toolName}...`);
          let toolRawResult: any;
          try {
              toolRawResult = await executeFunction(parsedArgs, toolContext);
              success = true;
              toolLogDetails.executionSuccess = true;
          } catch (execError) {
              success = false;
              executionError = mapError(execError);
              toolLogDetails.executionSuccess = false;
              toolLogDetails.executionError = executionError.message;
              // Use instanceof check before accessing details
              const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
              logger.error(`Error executing function for ${toolName}: ${executionError.message}`, errorDetails || executionError);
          } finally {
              const duration = Date.now() - toolCallStartTime;
              toolLogDetails.durationMs = duration;
              logger.log(`Call to ${toolName} ${success ? 'completed successfully' : 'failed'} in ${duration} ms.`);
              if (securityManager) {
                  const event: ExtendedToolCallEvent = {
                      toolName,
                      userId: userInfo?.userId || 'unknown',
                      args: parsedArgs,
                      result: success ? toolRawResult : { error: executionError?.message },
                      success,
                      error: executionError instanceof Error ? executionError : undefined, // Only pass if it's Error
                      timestamp: toolCallStartTime,
                      duration: duration,
                  };
                  try {
                      securityManager.logToolCall(event);
                  } catch (logError) {
                       logger.error(`Error logging ${toolName} call through SecurityManager:`, logError);
                  }
              }
          }

          if (success) {
              toolResultContent = jsonUtils.stringifyOrThrow(toolRawResult ?? null, `tool ${toolName} result`, { logger });
          } else {
              toolResultContent = jsonUtils.stringifyOrThrow(
                  { error: `Error executing tool '${toolName}': ${executionError?.message || 'Unknown execution error'}` },
                  `tool ${toolName} error`,
                  { logger }
              );
          }
          logger.debug(`Result formatted for LLM (tool_call_id: ${toolCallId}): ${toolResultContent.substring(0, 200)}...`);

      } catch (error) {
          const mappedError = mapError(error);
          executionError = mappedError;
          success = false;
          const currentToolName = toolLogDetails.name || toolCall.function?.name || '<unknown tool>';
          const errorMessage = executionError.message || 'Unknown error processing call';
           // Use instanceof check before accessing details
           const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
          logger.error(`Critical error processing ${currentToolName} call (ID: ${toolCall.id}): ${errorMessage}`, errorDetails || executionError);

          toolResultContent = jsonUtils.safeStringify(
              { error: `Error processing tool call '${currentToolName}': ${errorMessage}` },
              `{"error":"Failed to format error message for tool '${currentToolName}'"}`,
              { logger }
          );
          toolLogDetails.criticalError = errorMessage;
          toolLogDetails.criticalErrorDetails = errorDetails;
      }

      return {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultContent,
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

  logger.log(`Processing of ${toolCalls.length} tool calls completed. Sending ${toolResultsMessages.length} results back to LLM...`);

  try {
    const messagesForNextCall: Message[] = [...currentMessages, ...toolResultsMessages];
    logger.debug('Messages for next LLM call:', messagesForNextCall);

    const finalApiResponse = await client.chat({
        prompt: '',
        customMessages: messagesForNextCall,
    });
    logger.log('Received final response from LLM after tool processing.');
    logger.debug('Final LLM response:', finalApiResponse);

    return typeof finalApiResponse === 'string'
        ? finalApiResponse
        : jsonUtils.safeStringify(finalApiResponse, '{ "error": "Could not stringify final LLM response" }', { logger });

  } catch (error) {
     const mappedError = mapError(error);
     logger.error(`Error sending tool results to LLM or receiving final response: ${mappedError.message}`, mappedError);
    throw mappedError;
  }
}

/**
 * Static helper class for working with tools (tools/functions).
 */
export class ToolHandler {
  /**
   * @internal
   */
  static async handleToolCalls(params: InternalToolHandlerParams): Promise<string> {
    return _internalHandleToolCalls(params);
  }

  /**
   * Formats tool definition to the format expected by OpenRouter/OpenAI API.
   * @param toolInput - Tool definition in standard or simplified format.
   * @returns {Tool} Tool definition in `{ type: 'function', function: {...} }` format.
   * @throws {ValidationError} If invalid tool object provided.
   * @deprecated Support for simplified format may be removed.
   */
  static formatToolForAPI(toolInput: Record<string, any> | Tool): Tool {
    if (!toolInput || typeof toolInput !== 'object') {
        throw new ValidationError('Invalid tool object: expected object.');
    }

    // 1. Check standard OpenAI format
    // Use 'in' to check key presence without accessing value
    if ('type' in toolInput && toolInput.type === 'function' && 'function' in toolInput && typeof toolInput.function === 'object' && toolInput.function !== null && 'name' in toolInput.function && typeof toolInput.function.name === 'string') {
        const tool = toolInput as Tool; // Confident in type after checks
        if ('parameters' in tool.function && tool.function.parameters && (typeof tool.function.parameters !== 'object' || tool.function.parameters === null)) {
            throw new ValidationError(`Tool '${tool.function.name}': 'function.parameters' field must be a JSON Schema object.`);
        }
        return tool;
    }

    // 2. Check simplified/legacy format
    // Use 'in' to check for 'name'
    if ('name' in toolInput && typeof toolInput.name === 'string' && toolInput.name.length > 0) {
        const toolName = toolInput.name;
        // Check parameters if present
        if ('parameters' in toolInput && toolInput.parameters && (typeof toolInput.parameters !== 'object' || toolInput.parameters === null)) {
            throw new ValidationError(`Tool '${toolName}' (simplified format): 'parameters' field must be a JSON Schema object.`);
        }

        const formattedTool: Tool = {
          type: 'function',
          function: {
              name: toolName,
              description: ('description' in toolInput && typeof toolInput.description === 'string') ? toolInput.description : '',
              parameters: ('parameters' in toolInput && typeof toolInput.parameters === 'object' && toolInput.parameters !== null) ? toolInput.parameters : { type: 'object', properties: {} },
          },
          // Copy execute and security if they exist and correct type
          ...('execute' in toolInput && typeof toolInput.execute === 'function' && { execute: toolInput.execute }),
          ...('security' in toolInput && typeof toolInput.security === 'object' && toolInput.security !== null && { security: toolInput.security }),
          name: toolName,
        };
        return formattedTool;
    }

    // 3. If neither format matches
    throw new ValidationError('Failed to recognize tool format: missing `type: "function"` or `name` at top level.');
  }
}