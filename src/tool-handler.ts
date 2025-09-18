// Path: src/tool-handler.ts
import { Message, Tool, ToolCall, UserAuthInfo, ToolContext, ToolCallDetail, ToolCallOutcome } from './types';
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

// --- Internal Helper Functions ---

function createErrorDetail(error: OpenRouterError | Error): {
    type: string;
    message: string;
    details?: any;
} {
    const mappedError = mapError(error);
    return {
        type: mappedError.code || ErrorCode.UNKNOWN_ERROR,
        message: mappedError.message,
        details: mappedError.details
    };
}

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
         structuredError.details = mappedError.details;
         logger.debug(`Including details in structured error for ${mappedError.code}:`, mappedError.details);
    } else if (mappedError.code === ErrorCode.TOOL_ERROR && mappedError.details) {
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
    logger: Logger,
    includeToolResultInReport: boolean // New parameter
): Promise<ToolCallOutcome> { // Return ToolCallOutcome
    const toolCallStartTime = Date.now();
    let toolResultContent: string; // Now will contain JSON string result or error
    let executionSuccess = false;
    let executionError: OpenRouterError | Error | undefined;
    let parsedArgs: any = null;
    const toolLogDetails: Record<string, any> = { tool_call_id: toolCall.id };

    const toolName = toolCall.function?.name;

    // Initialize details structure
    const details: Partial<ToolCallDetail> = {
        toolCallId: toolCall.id,
        toolName: toolName || 'unknown_tool', // Fallback name
        requestArgsString: toolCall.function?.arguments || '',
        status: 'error_unknown', // Default status
        error: null,
        result: null,
    };

    if (!toolName) {
        logger.error(`Tool call failed: Missing function name. Tool Call ID: ${toolCall.id}`, toolCall);
        const missingNameError = new ToolError(`Tool call (ID: ${toolCall.id}) is missing the function name.`);
        details.status = 'error_unknown'; // Or a more specific error
        details.error = createErrorDetail(missingNameError);
        // FIX 1: Provide fallback 'unknown_tool' if details.toolName is undefined/null
        toolResultContent = formatToolErrorForLLM(missingNameError, details.toolName || 'unknown_tool', logger);

        return {
            message: { role: 'tool', tool_call_id: toolCall.id, content: toolResultContent, name: 'error_handler' },
            details: { ...details, resultString: toolResultContent } as ToolCallDetail
        };
    }

    logger.debug(`Processing tool call: '${toolName}' (ID: ${toolCall.id})`);

    try {
        const { id: toolCallId, function: funcCall } = toolCall;
        if (!funcCall) throw new ToolError(`Tool call (ID: ${toolCallId}) is missing the 'function' object.`);

        const argsString = funcCall.arguments;
        details.requestArgsString = argsString; // Already set, but for clarity

        const toolDefinition = availableTools.find(t => t.type === 'function' && (t.function.name === toolName || t.name === toolName));
        if (!toolDefinition) {
            throw new ToolError(`Tool '${toolName}' is not defined or not available in the provided 'tools' list.`);
        }
        const executeFunction = toolDefinition.execute;
        if (!executeFunction || typeof executeFunction !== 'function') {
             details.status = 'error_not_found'; // Or internal error
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
            // Determine specific status based on error type
            const mappedValError = mapError(validationOrParsingError);
            if (mappedValError.code === ErrorCode.JSON_PARSE_ERROR) {
                details.status = 'error_parsing';
            } else if (mappedValError.code === ErrorCode.JSON_SCHEMA_ERROR || mappedValError.code === ErrorCode.VALIDATION_ERROR) {
                details.status = 'error_validation';
            } else {
                details.status = 'error_parsing'; // Fallback
            }
            details.error = createErrorDetail(mappedValError);
            details.parsedArgs = null; // Ensure parsedArgs is null on error
            throw validationOrParsingError; // Re-throw to be caught by outer handler
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
                 details.status = 'error_security';
                 details.error = createErrorDetail(mappedSecError);
                 throw securityError; // Re-throw
            }
        } else {
            logger.debug(`SecurityManager not configured, security checks for '${toolName}' skipped.`);
        }

        // --- Execute Tool Function ---
        const toolContext: ToolContext = {
            userInfo: userInfo || undefined,
            securityManager: securityManager || undefined,
            logger: logger.withPrefix(`Tool:${toolName}`),
            includeToolResultInReport // Pass option to context
        };
        logger.debug(`Executing function for tool '${toolName}'...`);
        let toolRawResult: any;
        try {
            toolRawResult = await executeFunction(parsedArgs, toolContext);
            executionSuccess = true;
            details.status = 'success';
            if (includeToolResultInReport) { // Conditionally store full result
                details.result = toolRawResult;
            } else {
                details.result = null; // Explicitly null if not included
            }
            details.error = null;
            logger.debug(`Execution of '${toolName}' completed successfully.`);
        } catch (execError) {
            executionSuccess = false;
            executionError = mapError(execError); // Execution error
            details.status = 'error_execution';
            details.error = createErrorDetail(executionError);
            details.result = null;
            // FIX 2: Check if details.error exists before accessing details.error.details
            const errorLogDetails = details.error ? details.error.details : undefined;
            logger.error(`Error executing function for tool '${toolName}': ${executionError.message}`, errorLogDetails || executionError);
            // Error will be formatted for LLM below
        } finally {
            const duration = Date.now() - toolCallStartTime;
            details.durationMs = duration;
            logger.log(`Tool call '${toolName}' (ID: ${toolCall.id}) finished. Status: ${details.status}. Duration: ${duration}ms.`);
            // Log tool call via SecurityManager if available
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

        if (executionSuccess) {
            // Successful result serializes to JSON
            toolResultContent = jsonUtils.stringifyOrThrow(toolRawResult ?? null, `tool '${toolName}' result`, { logger });
        } else {
            toolResultContent = formatToolErrorForLLM(executionError!, toolName, logger); // executionError is defined here if !executionSuccess
        }
        logger.debug(`Final content for LLM (Tool Call ID: ${toolCall.id}): ${toolResultContent.substring(0, 200)}...`);

    } catch (error) {
        // --- Catch errors from definition finding, parsing, validation, security checks ---
        const mappedError = mapError(error);
        executionError = mappedError;
        executionSuccess = false;
        const currentToolName = details.toolName || '<unknown tool>'; // Use fallback name
        const errorMessage = executionError.message || `Unknown error processing call for ${currentToolName}`;
         const errorDetails = executionError instanceof OpenRouterError ? executionError.details : undefined;
        logger.error(`Error processing tool call '${currentToolName}' (ID: ${toolCall.id}) before execution: ${errorMessage}`, errorDetails || executionError);

        // Update details if not already set by specific error handlers above
        if (details.status === 'error_unknown') {
             details.error = createErrorDetail(mappedError);
             // Try to guess status if possible, otherwise keep unknown
             if (mappedError.code === ErrorCode.TOOL_ERROR && errorMessage.includes("not defined")) details.status = 'error_not_found';
             else if (mappedError.code === ErrorCode.VALIDATION_ERROR) details.status = 'error_validation';
             else if (mappedError.code === ErrorCode.JSON_PARSE_ERROR) details.status = 'error_parsing';
             else if (mappedError.code === ErrorCode.SECURITY_ERROR || mappedError.code === ErrorCode.ACCESS_DENIED_ERROR || mappedError.code === ErrorCode.RATE_LIMIT_ERROR) details.status = 'error_security';
        }

        toolResultContent = formatToolErrorForLLM(mappedError, currentToolName, logger);

        toolLogDetails.criticalError = errorMessage;
        toolLogDetails.criticalErrorCode = executionError instanceof OpenRouterError ? executionError.code : undefined;
        toolLogDetails.criticalErrorDetails = errorDetails;
    }

    // --- Construct and Return the Outcome ---
    details.resultString = toolResultContent; // Store the final string sent to LLM

    return {
        message: {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResultContent,
            name: toolName || 'error_handler', // Use original toolName or error_handler
        },
        details: details as ToolCallDetail // Cast Partial to full type
    };
};

interface InternalToolHandlerParams {
  message: Message & { tool_calls: ToolCall[] };
  debug: boolean;
  tools: Tool[];
  securityManager?: SecurityManager;
  userInfo: UserAuthInfo | null;
  logger: Logger;
  parallelCalls?: boolean;
  includeToolResultInReport?: boolean; // New option
}

// Now returns ToolCallOutcome[]
async function _internalHandleToolCalls(params: InternalToolHandlerParams): Promise<ToolCallOutcome[]> {
  const {
    message,
    tools = [],
    securityManager,
    userInfo,
    logger,
    parallelCalls = true,
    includeToolResultInReport = false, // Default to false
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

  let toolResultsOutcomes: ToolCallOutcome[];

  try {
      const processCallFn = (toolCall: ToolCall) =>
          _processSingleToolCall(
              toolCall,
              availableTools,
              securityManager,
              userInfo,
              logger,
              includeToolResultInReport // Pass option down
          );

      if (parallelCalls) {
          logger.debug("Executing tool calls in parallel...");
          toolResultsOutcomes = await Promise.all(toolCalls.map(processCallFn));
      } else {
          logger.debug("Executing tool calls sequentially...");
          toolResultsOutcomes = [];
          for (const toolCall of toolCalls) {
              const resultOutcome = await processCallFn(toolCall);
              toolResultsOutcomes.push(resultOutcome);
          }
      }
  } catch (error) {
      const mappedError = mapError(error);
      logger.error(`Unexpected error during batch tool call processing: ${mappedError.message}`, mappedError.details);
      throw mappedError;
  }

  logger.log(`Finished processing ${toolCalls.length} tool call(s). Returning ${toolResultsOutcomes.length} result outcomes.`);

  return toolResultsOutcomes;
}

export class ToolHandler {
  // Update signature to accept the new option and return ToolCallOutcome[]
  static async handleToolCalls(params: InternalToolHandlerParams): Promise<ToolCallOutcome[]> {
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

        // Include execute and security if they exist on the input object
        const formattedTool: Tool = {
            type: 'function',
            function: apiFormattedFunction,
             ...(toolInput.execute && typeof toolInput.execute === 'function' && { execute: toolInput.execute }),
             ...(toolInput.security && typeof toolInput.security === 'object' && toolInput.security !== null && { security: toolInput.security }),
             ...(toolInput.name && typeof toolInput.name === 'string' && { name: toolInput.name }), // Keep name if provided
        };
         // Ensure execute exists if provided directly (even if not strictly part of the interface type)
         if (toolInput.execute && typeof toolInput.execute === 'function') {
            formattedTool.execute = toolInput.execute;
         } else if (!formattedTool.execute) {
             // If execute wasn't found anywhere, it's an issue for a usable tool definition
             // Note: This check might be too strict if the tool is only for API schema definition
             // console.warn(`Tool definition for '${func.name}' is missing the 'execute' function. It can be sent to the API but not executed locally.`);
         }

        return formattedTool;
    }

    // Handle simplified format { name: "...", execute: ..., ... }
    if (typeof toolInput.name === 'string' && toolInput.name.length > 0 && typeof (toolInput as any).execute === 'function') {
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
          execute: simplifiedTool.execute, // Required in simplified format
          ...(simplifiedTool.security && { security: simplifiedTool.security }),
           name: toolName, // Include the name field as well
        };
        return formattedTool;
    }

    throw new ValidationError('Failed to format tool: Unknown structure. Provide either { type: "function", function: { name: ... } } or { name: "...", execute: ... }.');
  }
}