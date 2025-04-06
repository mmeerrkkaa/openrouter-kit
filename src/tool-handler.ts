// Path: src/tool-handler.ts
import { Message, Tool, ToolCall, UserAuthInfo, ToolContext } from './types';
import { ExtendedToolCallEvent, SecurityContext } from './security/types';
import {
    mapError,
    OpenRouterError,
    ToolError,
    ValidationError,
    ErrorCode,
    AccessDeniedError,
    AuthorizationError,
    SecurityError,
    RateLimitError,
    ConfigError
} from './utils/error';
import * as jsonUtils from './utils/json-utils';
import type { SecurityManager } from './security/security-manager';
import { Logger } from './utils/logger';

interface StructuredToolError {
    errorType: string; // // Error code (from ErrorCode)
    errorMessage: string; // Error message
    details?: any; // Optional details (e.g., validation errors)
}
// ---

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
 * Formats a tool error in a structured JSON (string) for LLM.
 * @internal
 */
function formatToolErrorForLLM(error: OpenRouterError | Error, toolName: string, logger: Logger): string {
    const mappedError = mapError(error);

    const structuredError: StructuredToolError = {
        errorType: mappedError.code || ErrorCode.UNKNOWN_ERROR,
        errorMessage: mappedError.message || `An unknown error occurred while processing tool '${toolName}'.`,
        details: undefined
    };

    // Add details selectively based on error type
    if (
        (mappedError.code === ErrorCode.VALIDATION_ERROR ||
         mappedError.code === ErrorCode.JSON_PARSE_ERROR ||
         mappedError.code === ErrorCode.JSON_SCHEMA_ERROR ||
         mappedError.code === ErrorCode.DANGEROUS_ARGS) &&
        mappedError.details
    ) {
         // For validation/parsing/argument errors, details may be useful
         structuredError.details = mappedError.details;
         logger.debug(`Including details in structured error for ${mappedError.code}:`, mappedError.details);
    } else if (mappedError.code === ErrorCode.TOOL_ERROR && mappedError.details) {
         // For tool execution errors, if details are present
         structuredError.details = mappedError.details;
         logger.debug(`Including details in structured error for ${mappedError.code}:`, mappedError.details);
    }
    // Do not include details for Auth/Access/RateLimit errors by default

    logger.warn(`Formatted structured error for LLM (Tool: ${toolName}):`, structuredError);

    // Serialize to JSON string. Use safeStringify for reliability.
    return jsonUtils.safeStringify(
        structuredError,
        // Fallback JSON string, if serialization fails
        `{"errorType": "${ErrorCode.INTERNAL_ERROR}", "errorMessage": "Failed to serialize tool error object for tool ${toolName}"}`,
        { logger }
    );
}


async function _processSingleToolCall(
    toolCall: ToolCall,
    availableTools: Tool[],
    securityManager: SecurityManager | undefined,
    userInfo: UserAuthInfo | null,
    logger: Logger
): Promise<Message> {
    const toolCallStartTime = Date.now();
    let toolResultContent: string; // Now will contain JSON string result or error
    let executionSuccess = false;
    let executionError: OpenRouterError | Error | undefined;
    let parsedArgs: any = null;
    const toolLogDetails: Record<string, any> = { tool_call_id: toolCall.id };

    const toolName = toolCall.function?.name;
    toolLogDetails.name = toolName;

    if (!toolName) {
        logger.error(`Tool call failed: Missing function name. Tool Call ID: ${toolCall.id}`, toolCall);
        // Format error in JSON
        toolResultContent = formatToolErrorForLLM(
            new ToolError(`Tool call (ID: ${toolCall.id}) is missing the function name.`),
            'unknown_tool',
            logger
        );
        return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResultContent,
            name: 'error_handler' // Error name
        };
    }

    logger.debug(`Processing tool call: '${toolName}' (ID: ${toolCall.id})`);

    try {
        const { id: toolCallId, function: funcCall } = toolCall;
        if (!funcCall) throw new ToolError(`Tool call (ID: ${toolCallId}) is missing the 'function' object.`);

        const argsString = funcCall.arguments;
        toolLogDetails.rawArgs = argsString;

        const toolDefinition = availableTools.find(t => t.type === 'function' && (t.function.name === toolName || t.name === toolName));
        if (!toolDefinition) {
            throw new ToolError(`Tool '${toolName}' is not defined or not available in the provided 'tools' list.`);
        }
        const executeFunction = toolDefinition.execute;
        if (!executeFunction || typeof executeFunction !== 'function') {
             throw new ToolError(`Implementation ('execute' function) not found or not a function for tool '${toolName}'.`);
        }
        toolLogDetails.definitionFound = true;

        try {
            logger.debug(`Parsing arguments for '${toolName}'... Raw: ${argsString}`);
            parsedArgs = jsonUtils.parseOrThrow(argsString, `tool '${toolName}' arguments`, { logger });
            toolLogDetails.parsedArgs = parsedArgs;

            const schema = toolDefinition.function?.parameters;
            if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) {
                 logger.debug(`Validating arguments for '${toolName}' against schema...`);
                 jsonUtils.validateJsonSchema(parsedArgs, schema, `tool '${toolName}' arguments`, { logger });
                 toolLogDetails.argsSchemaValid = true;
                 logger.debug(`Arguments for '${toolName}' passed schema validation.`);
            } else {
                logger.debug(`Schema for '${toolName}' not provided or empty, validation skipped.`);
                toolLogDetails.argsSchemaValid = null;
            }
        } catch (validationOrParsingError) {
            logger.warn(`Error parsing/validating arguments for '${toolName}': ${(validationOrParsingError as Error).message}`);
            toolLogDetails.argsSchemaValid = false;
            toolLogDetails.validationError = (validationOrParsingError as Error).message;
            throw validationOrParsingError; // Pass error above for formatting
        }

        if (securityManager) {
            logger.debug(`Performing security checks via SecurityManager for '${toolName}', User: ${userInfo?.userId || 'anonymous'}`);
            try {
                await securityManager.checkToolAccessAndArgs(toolDefinition, userInfo, parsedArgs);
                toolLogDetails.securityChecksPassed = true;
                logger.log(`Security checks passed for '${toolName}' (User: ${userInfo?.userId || 'anonymous'}).`);
            } catch (securityError) {
                 const mappedSecError = mapError(securityError);
                 logger.warn(`Security check FAILED for '${toolName}': ${mappedSecError.message} (Code: ${mappedSecError.code})`);
                 toolLogDetails.securityChecksPassed = false;
                 toolLogDetails.securityError = mappedSecError.message;
                 toolLogDetails.securityErrorCode = mappedSecError.code;
                 throw securityError; // Pass error above for formatting
            }
        } else {
            logger.debug(`SecurityManager not configured, security checks for '${toolName}' skipped.`);
            toolLogDetails.securityChecksPassed = null;
        }

        const toolContext: ToolContext = { userInfo: userInfo || undefined, securityManager: securityManager || undefined, logger: logger.withPrefix(`Tool:${toolName}`) };
        logger.debug(`Executing function for tool '${toolName}'...`);
        let toolRawResult: any;
        try {
            toolRawResult = await executeFunction(parsedArgs, toolContext);
            executionSuccess = true;
            toolLogDetails.executionSuccess = true;
            logger.debug(`Execution of '${toolName}' completed successfully.`);
        } catch (execError) {
            executionSuccess = false;
            executionError = mapError(execError); // Execution error
            toolLogDetails.executionSuccess = false;
            toolLogDetails.executionError = executionError.message;
             const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
            logger.error(`Error executing function for tool '${toolName}': ${executionError.message}`, errorDetails || executionError);
            // Error will be formatted below
        } finally {
            const duration = Date.now() - toolCallStartTime;
            toolLogDetails.durationMs = duration;
            logger.log(`Tool call '${toolName}' (ID: ${toolCall.id}) finished. Success: ${executionSuccess}. Duration: ${duration}ms.`);
            if (securityManager) {
                const event: ExtendedToolCallEvent = {
                    toolName,
                    userId: userInfo?.userId || 'anonymous',
                    args: parsedArgs,
                    result: executionSuccess ? toolRawResult : { error: executionError?.message },
                    success: executionSuccess,
                    error: executionError instanceof Error ? executionError : undefined,
                    timestamp: toolCallStartTime,
                    duration: duration,
                };
                try {
                    securityManager.logToolCall(event);
                } catch (logError) {
                     logger.error(`Error logging tool call via SecurityManager for ${toolName}:`, logError);
                }
            }
        }

        // --- Format Result for LLM ---
        if (executionSuccess) {
            // Successful result serializes to JSON
            toolResultContent = jsonUtils.stringifyOrThrow(toolRawResult ?? null, `tool '${toolName}' result`, { logger });
        } else {
            // Execution error is formatted via helper
            toolResultContent = formatToolErrorForLLM(executionError!, toolName, logger); // Используем ! т.к. executionError точно определен здесь
        }
        logger.debug(`Final content for LLM (Tool Call ID: ${toolCall.id}): ${toolResultContent.substring(0, 200)}...`);

    } catch (error) {
        // --- Catch errors from definition finding, parsing, validation, or security checks ---
        const mappedError = mapError(error);
        executionError = mappedError; // Save for possible logging
        executionSuccess = false;
        const currentToolName = toolLogDetails.name || '<unknown tool>';
        const errorMessage = executionError.message || `Unknown error processing call for ${currentToolName}`;
         const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
        logger.error(`Error processing tool call '${currentToolName}' (ID: ${toolCall.id}) before execution: ${errorMessage}`, errorDetails || executionError);

        // Format error that occurred *before* execution via helper
        toolResultContent = formatToolErrorForLLM(mappedError, currentToolName, logger);

        toolLogDetails.criticalError = errorMessage;
        toolLogDetails.criticalErrorCode = executionError instanceof OpenRouterError ? executionError.code : undefined;
        toolLogDetails.criticalErrorDetails = errorDetails;
    }

    // --- Construct and Return the 'tool' Message ---
    return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResultContent, // JSON string result or JSON string error
        name: toolName || 'error_handler', // Tool name or error handler name
    };
};

async function _internalHandleToolCalls(params: InternalToolHandlerParams): Promise<Message[]> {
  const {
    message,
    tools = [],
    securityManager,
    userInfo,
    logger,
    parallelCalls = true,
  } = params;

  if (!message?.tool_calls?.length) {
     logger.warn('[_internalHandleToolCalls] Called without valid tool_calls in the message. Returning empty array.');
     return [];
  }
  if (!Array.isArray(tools)) {
      logger.error('[_internalHandleToolCalls] Invalid `tools` parameter: expected an array.');
      throw new ConfigError("Invalid 'tools' provided to ToolHandler: must be an array.");
  }

  const toolCalls = message.tool_calls;
  const availableTools = tools;

  logger.log(`Processing ${toolCalls.length} tool call(s) requested by the model (Mode: ${parallelCalls ? 'Parallel' : 'Sequential'}).`);

  let toolResultsMessages: Message[];

  try {
      const processCallFn = (toolCall: ToolCall) =>
          _processSingleToolCall(toolCall, availableTools, securityManager, userInfo, logger);

      if (parallelCalls) {
          logger.debug("Executing tool calls in parallel...");
          toolResultsMessages = await Promise.all(toolCalls.map(processCallFn));
      } else {
          logger.debug("Executing tool calls sequentially...");
          toolResultsMessages = [];
          for (const toolCall of toolCalls) {
              const resultMessage = await processCallFn(toolCall);
              toolResultsMessages.push(resultMessage);
          }
      }
  } catch (error) {
      const mappedError = mapError(error);
      logger.error(`Unexpected error during batch tool call processing: ${mappedError.message}`, mappedError.details);
      throw mappedError;
  }

  logger.log(`Finished processing ${toolCalls.length} tool call(s). Returning ${toolResultsMessages.length} result messages.`);

  return toolResultsMessages;
}

export class ToolHandler {
  static async handleToolCalls(params: InternalToolHandlerParams): Promise<Message[]> {
    return _internalHandleToolCalls(params);
  }

  static formatToolForAPI(toolInput: Record<string, any> | Tool): Tool {
    if (!toolInput || typeof toolInput !== 'object') {
        throw new ValidationError('Invalid tool definition: Expected an object.');
    }

    if (toolInput.type === 'function' && typeof toolInput.function === 'object' && toolInput.function !== null) {
        const func = toolInput.function;
        if (typeof func.name !== 'string' || !func.name) {
            throw new ValidationError(`Invalid tool definition: 'function.name' (string) is required.`);
        }
        if (func.description !== undefined && typeof func.description !== 'string') {
            throw new ValidationError(`Invalid tool definition for '${func.name}': 'function.description' must be a string if provided.`);
        }
        if (func.parameters !== undefined && (typeof func.parameters !== 'object' || func.parameters === null || Array.isArray(func.parameters))) {
            throw new ValidationError(`Invalid tool definition for '${func.name}': 'function.parameters' must be a JSON Schema object if provided.`);
        }

        const apiFormattedFunction: Tool['function'] = {
            name: func.name,
            ...(func.description && { description: func.description }),
            ...(func.parameters && typeof func.parameters === 'object' && Object.keys(func.parameters).length > 0 && { parameters: func.parameters }),
        };

        return {
            type: 'function',
            function: apiFormattedFunction,
             ...(toolInput.execute && typeof toolInput.execute === 'function' && { execute: toolInput.execute }),
             ...(toolInput.security && typeof toolInput.security === 'object' && toolInput.security !== null && { security: toolInput.security }),
             ...(toolInput.name && typeof toolInput.name === 'string' && { name: toolInput.name }),
        };
    }

    if (typeof toolInput.name === 'string' && toolInput.name.length > 0) {
        const simplifiedTool = toolInput as any;
        const toolName = simplifiedTool.name;

        if (simplifiedTool.execute !== undefined && typeof simplifiedTool.execute !== 'function') {
             throw new ValidationError(`Invalid tool definition for '${toolName}' (simplified format): 'execute' must be a function if provided.`);
         }
         if (simplifiedTool.description !== undefined && typeof simplifiedTool.description !== 'string') {
             throw new ValidationError(`Invalid tool definition for '${toolName}' (simplified format): 'description' must be a string if provided.`);
         }
         if (simplifiedTool.parameters !== undefined && (typeof simplifiedTool.parameters !== 'object' || simplifiedTool.parameters === null || Array.isArray(simplifiedTool.parameters))) {
              throw new ValidationError(`Invalid tool definition for '${toolName}' (simplified format): 'parameters' must be a JSON Schema object if provided.`);
          }
         if (simplifiedTool.security !== undefined && (typeof simplifiedTool.security !== 'object' || simplifiedTool.security === null)) {
             throw new ValidationError(`Invalid tool definition for '${toolName}' (simplified format): 'security' must be an object if provided.`);
         }

        const functionDefinition: Tool['function'] = {
          name: toolName,
          description: simplifiedTool.description || '',
          ...(simplifiedTool.parameters && typeof simplifiedTool.parameters === 'object' && Object.keys(simplifiedTool.parameters).length > 0 && { parameters: simplifiedTool.parameters }),
        };

        const formattedTool: Tool = {
          type: 'function',
          function: functionDefinition,
          ...(simplifiedTool.execute && { execute: simplifiedTool.execute }),
          ...(simplifiedTool.security && { security: simplifiedTool.security }),
           name: toolName,
        };
        // Ensure execute exists if provided
        if (simplifiedTool.execute) {
            formattedTool.execute = simplifiedTool.execute;
        } else {
             // Throw error if execute is missing in simplified format
             throw new ValidationError(`Tool '${toolName}' (simplified format) requires an 'execute' function.`);
        }
        return formattedTool;
    }

    throw new ValidationError('Failed to format tool: Unknown structure. Provide either { type: "function", function: { name: ... } } or { name: "...", execute: ... }.');
  }
}