// Path: src/core/chat-processor.ts
import { AxiosResponse } from 'axios';
import {
    Message,
    Tool,
    UserAuthInfo,
    OpenRouterRequestOptions,
    OpenRouterResponse,
    UsageInfo,
    ResponseFormat,
    HistoryEntry,
    ApiCallMetadata,
    UrlCitationAnnotation,
    ToolCall,
    ToolCallDetail, // Import new type
    ToolCallOutcome // Import new type
} from '../types';
import { ApiHandler } from './api-handler';
import { UnifiedHistoryManager } from '../history/unified-history-manager';
import { SecurityManager } from '../security/security-manager';
import { CostTracker } from '../cost-tracker';
import { ToolHandler } from '../tool-handler';
import { Logger } from '../utils/logger';
import * as jsonUtils from '../utils/json-utils';
import { formatDateTime } from '../utils/formatting';
import { mapError, OpenRouterError, ErrorCode, ValidationError, APIError, ToolError, AuthenticationError, AccessDeniedError, RateLimitError } from '../utils/error';

// Update internal result type
interface HandleApiResponseResult {
    content: any;
    usage: UsageInfo | null;
    model: string;
    toolCallsCount: number;
    toolCalls?: ToolCallDetail[]; // Add optional tool call details
    finishReason: string | null;
    id?: string;
    cost?: number | null;
    reasoning?: string | null;
    annotations?: UrlCitationAnnotation[];
    apiCallMetadata: ApiCallMetadata | null;
    newlyAddedMessages: Message[];
}

function sumUsage(usage1: UsageInfo | null | undefined, usage2: UsageInfo | null | undefined): UsageInfo | null {
    if (!usage1 && !usage2) return null;
    if (!usage1) return usage2!;
    if (!usage2) return usage1!;
    return {
        prompt_tokens: (usage1.prompt_tokens || 0) + (usage2.prompt_tokens || 0),
        completion_tokens: (usage1.completion_tokens || 0) + (usage2.completion_tokens || 0),
        total_tokens: (usage1.total_tokens || 0) + (usage2.total_tokens || 0),
    };
}

interface ChatProcessorDependencies {
    apiHandler: ApiHandler;
    historyManager: UnifiedHistoryManager;
    securityManager: SecurityManager | null;
    costTracker: CostTracker | null;
    logger: Logger;
    filterMessagesForApi: (messages: Message[]) => Message[];
}

interface ChatProcessorConfig {
    defaultModel: string;
    defaultMaxToolCalls: number;
    defaultStrictJsonParsing: boolean;
    debug: boolean;
}

export class ChatProcessor {
    private apiHandler: ApiHandler;
    private historyManager: UnifiedHistoryManager;
    private securityManager: SecurityManager | null;
    private costTracker: CostTracker | null;
    private logger: Logger;
    private config: ChatProcessorConfig;
    private filterMessagesForApi: (messages: Message[]) => Message[];

    constructor(dependencies: ChatProcessorDependencies, config: ChatProcessorConfig) {
        this.apiHandler = dependencies.apiHandler;
        this.historyManager = dependencies.historyManager;
        this.securityManager = dependencies.securityManager;
        this.costTracker = dependencies.costTracker;
        this.logger = dependencies.logger.withPrefix('ChatProcessor');
        this.filterMessagesForApi = dependencies.filterMessagesForApi;
        this.config = config;
        this.logger.log('ChatProcessor initialized.');
    }

    public async processChat(
        params: {
            initialMessages: Message[];
            requestOptions: OpenRouterRequestOptions;
            userInfo: UserAuthInfo | null;
        }
    ): Promise<HandleApiResponseResult> {
        const { initialMessages, requestOptions, userInfo } = params;
        const {
            tools,
            strictJsonParsing = this.config.defaultStrictJsonParsing,
            maxToolCalls = this.config.defaultMaxToolCalls,
            model = this.config.defaultModel,
            temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed, route, transforms, responseFormat, provider, models, plugins, reasoning,
            parallelToolCalls = undefined,
            toolChoice,
            includeToolResultInReport = false // Get option from request
        } = requestOptions;

        const initialRequestBody = this.apiHandler.buildChatRequestBody({
            model,
            messages: initialMessages,
            tools: tools || null,
            responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed,
            toolChoice: toolChoice,
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined,
            route, transforms, provider, models, plugins, reasoning,
            filterMessagesForApi: this.filterMessagesForApi
        });

        const initialResponse = await this.apiHandler.sendChatRequest(initialRequestBody, 0);

        // Pass includeToolResultInReport down
        const recursiveRequestOptions: Partial<OpenRouterRequestOptions> & { model: string, includeToolResultInReport?: boolean } = {
            model,
            temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed, route, transforms, responseFormat, provider, models, plugins, reasoning,
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined,
            includeToolResultInReport // Pass the option
        };

        const result = await this._handleApiResponseInternal({
            response: initialResponse,
            currentMessages: initialMessages,
            tools: tools || undefined,
            userInfo,
            strictJsonParsing,
            depth: 0,
            requestOptions: recursiveRequestOptions,
            maxToolCalls,
            cumulativeUsage: null,
            cumulativeToolCalls: 0,
            cumulativeToolCallDetails: [] // Initialize details array
        });

        return result;
    }


    private async _handleApiResponseInternal(params: {
        response: AxiosResponse<OpenRouterResponse>;
        currentMessages: Message[];
        tools?: Tool[];
        userInfo?: UserAuthInfo | null;
        strictJsonParsing: boolean;
        depth: number;
        requestOptions: Partial<OpenRouterRequestOptions> & { model: string, includeToolResultInReport?: boolean }; // Include option type
        maxToolCalls: number;
        cumulativeUsage: UsageInfo | null;
        cumulativeToolCalls: number;
        cumulativeToolCallDetails: ToolCallDetail[]; // Add parameter
    }): Promise<HandleApiResponseResult> {
        const {
            response, currentMessages: messagesForThisCall, tools, userInfo, strictJsonParsing, depth,
            requestOptions, maxToolCalls, cumulativeUsage, cumulativeToolCalls, cumulativeToolCallDetails // Destructure new param
        } = params;

        const responseData = response.data;
        const responseModel = responseData?.model || requestOptions.model;
        const responseTimestamp = Date.now();
        this.logger.debug(`(Depth ${depth}) Handling API response. Status: ${response.status}, Model: ${responseModel}`);

        let currentCumulativeUsage = sumUsage(cumulativeUsage, responseData?.usage);
        if (responseData?.usage) this.logger.log(`(Depth ${depth}) Usage (this step):`, responseData.usage);
        this.logger.debug(`(Depth ${depth}) Cumulative Usage:`, currentCumulativeUsage);

        const stepCost = this.costTracker?.calculateCost(responseModel, responseData?.usage) ?? null;
        // Note: Cumulative cost calculation based on cumulative usage might be slightly inaccurate if model changes mid-request due to fallbacks
        const cumulativeCost = this.costTracker?.calculateCost(responseModel, currentCumulativeUsage) ?? null;

        this.logger.debug(`(Depth ${depth}) API response data summary:`, { id: responseData?.id, model: responseModel, choicesCount: responseData?.choices?.length, usage: responseData?.usage, error: responseData?.error });

        const currentApiCallMetadata: ApiCallMetadata = {
            callId: responseData?.id || `local-gen-${Date.now()}`,
            modelUsed: responseModel,
            usage: responseData?.usage || null,
            cost: stepCost,
            timestamp: responseTimestamp,
            finishReason: responseData?.choices?.[0]?.finish_reason || null,
            requestMessagesCount: messagesForThisCall.length,
        };

        // Error Handling
        if (responseData?.error) {
            const apiErrorData = responseData.error as any;
            const message = apiErrorData.message || `Unknown API error at depth ${depth}`;
            const statusCode = response.status || (typeof apiErrorData.status === 'number' ? apiErrorData.status : 500);
            this.logger.error(`(Depth ${depth}) API returned error in body:`, responseData.error);

            let mappedError: OpenRouterError;
            if (statusCode === 401) mappedError = new AuthenticationError(message, statusCode, apiErrorData);
            else if (statusCode === 403) mappedError = new AccessDeniedError(message, statusCode, apiErrorData);
            else if (statusCode === 429) mappedError = new RateLimitError(message, statusCode, apiErrorData);
            else mappedError = new APIError(message, statusCode, { code: apiErrorData.code || ErrorCode.API_ERROR, details: apiErrorData, depth });

            currentApiCallMetadata.finishReason = mappedError.code || 'error';

            // Return existing tool call details even if the API call failed
            return {
                content: null, usage: currentCumulativeUsage, model: responseModel,
                toolCallsCount: cumulativeToolCalls,
                toolCalls: cumulativeToolCallDetails, // Include collected details
                finishReason: currentApiCallMetadata.finishReason,
                id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [],
            };
        }

        if (!responseData?.choices?.length) {
            this.logger.warn(`(Depth ${depth}) API response missing or empty "choices" array.`, responseData);
            currentApiCallMetadata.finishReason = 'error_no_choices';
            return {
                content: null, usage: currentCumulativeUsage, model: responseModel,
                toolCallsCount: cumulativeToolCalls,
                toolCalls: cumulativeToolCallDetails, // Include collected details
                finishReason: currentApiCallMetadata.finishReason,
                id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [],
            };
        }

        const choice = responseData.choices[0];
        const assistantMessageFromAPI = choice.message;

        if (!assistantMessageFromAPI) {
            this.logger.warn(`(Depth ${depth}) No message found in API response choice[0].`);
            currentApiCallMetadata.finishReason = 'error_no_message';
            return {
                content: null, usage: currentCumulativeUsage, model: responseModel,
                toolCallsCount: cumulativeToolCalls,
                toolCalls: cumulativeToolCallDetails, // Include collected details
                finishReason: currentApiCallMetadata.finishReason,
                id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [],
            };
        }

        currentApiCallMetadata.finishReason = choice.finish_reason;

        const assistantMessageWithTimestamp: Message = {
            ...assistantMessageFromAPI,
            timestamp: formatDateTime(new Date(responseTimestamp)),
            reasoning: assistantMessageFromAPI.reasoning ?? null,
            annotations: assistantMessageFromAPI.annotations ?? [],
        };

        const newlyAddedMessages: Message[] = [assistantMessageWithTimestamp];
        const messagesForNextCall = [...messagesForThisCall, assistantMessageWithTimestamp];
        const finishReason = choice.finish_reason;
        let currentToolCallsCount = cumulativeToolCalls;
        let currentToolCallDetails = [...cumulativeToolCallDetails]; // Copy details for this branch

        // Handle Tool Calls
        if (finishReason === 'tool_calls' && assistantMessageFromAPI.tool_calls?.length) {
            if (!tools || tools.length === 0) {
                this.logger.error(`(Depth ${depth}) API requested tool calls, but no tools were provided.`);
                currentApiCallMetadata.finishReason = 'error_missing_tools';
                // Include assistant message even if tools are missing
                return {
                    content: null, usage: currentCumulativeUsage, model: responseModel,
                    toolCallsCount: currentToolCallsCount,
                    toolCalls: currentToolCallDetails,
                    finishReason: currentApiCallMetadata.finishReason,
                    id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                    annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [assistantMessageWithTimestamp]
                };
            }

            const numberOfCalls = assistantMessageFromAPI.tool_calls.length;
            currentToolCallsCount += numberOfCalls;
            this.logger.log(`(Depth ${depth}) Tool calls requested (${numberOfCalls}). Total: ${currentToolCallsCount}. Max: ${maxToolCalls}. Processing...`);

            if (depth >= maxToolCalls) {
                this.logger.warn(`(Depth ${depth}) Maximum tool call depth (${maxToolCalls}) reached.`);
                currentApiCallMetadata.finishReason = 'error_max_tool_depth';
                return {
                    content: null, usage: currentCumulativeUsage, model: responseModel,
                    toolCallsCount: currentToolCallsCount,
                    toolCalls: currentToolCallDetails,
                    finishReason: currentApiCallMetadata.finishReason,
                    id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                    annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [assistantMessageWithTimestamp]
                };
            }

            let toolOutcomes: ToolCallOutcome[] = [];
            try {
                // Pass includeToolResultInReport option to handler
                toolOutcomes = await ToolHandler.handleToolCalls({
                    message: assistantMessageWithTimestamp as Message & { tool_calls: ToolCall[] },
                    debug: this.config.debug,
                    tools: tools,
                    securityManager: this.securityManager || undefined,
                    userInfo: userInfo ?? null,
                    logger: this.logger.withPrefix(`ToolHandler(Depth ${depth})`),
                    parallelCalls: requestOptions.parallelToolCalls ?? true,
                    includeToolResultInReport: requestOptions.includeToolResultInReport ?? false // Pass option
                });
            } catch (toolHandlerError) {
                const mappedError = mapError(toolHandlerError);
                this.logger.error(`(Depth ${depth}) Error during tool execution: ${mappedError.message}`, mappedError.details);
                currentApiCallMetadata.finishReason = 'error_tool_execution';
                // Include assistant message and any *previous* tool details
                return {
                    content: null, usage: currentCumulativeUsage, model: responseModel,
                    toolCallsCount: currentToolCallsCount,
                    toolCalls: currentToolCallDetails, // Use details accumulated *before* this failed batch
                    finishReason: currentApiCallMetadata.finishReason,
                    id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                    annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [assistantMessageWithTimestamp]
                };
            }

            // Process outcomes: extract messages and details
            const toolResultsMessages = toolOutcomes.map(outcome => outcome.message);
            const newToolDetails = toolOutcomes.map(outcome => outcome.details);
            currentToolCallDetails.push(...newToolDetails); // Add details from this batch

            const toolResultsWithTimestamps = toolResultsMessages.map(msg => ({
                ...msg, timestamp: msg.timestamp || formatDateTime()
            }));
            messagesForNextCall.push(...toolResultsWithTimestamps);
            newlyAddedMessages.push(...toolResultsWithTimestamps); // Add tool results to newly added messages
            this.logger.debug(`(Depth ${depth}) Added ${toolResultsMessages.length} tool result messages.`);

            this.logger.log(`(Depth ${depth + 1}) Sending tool results back to LLM...`);
            const nextRequestBody = this.apiHandler.buildChatRequestBody({
                ...requestOptions, // Pass all options down
                model: responseModel, // Use the model determined by the API response
                messages: messagesForNextCall,
                tools: tools || null, // Send tool definitions again
                toolChoice: 'auto', // Let model decide next step
                filterMessagesForApi: this.filterMessagesForApi
            });

            const nextResponse = await this.apiHandler.sendChatRequest(nextRequestBody, depth + 1);

            // Recursive call, passing accumulated details
            return await this._handleApiResponseInternal({
                ...params, // Pass most params down
                response: nextResponse,
                currentMessages: messagesForNextCall,
                depth: depth + 1,
                cumulativeUsage: currentCumulativeUsage,
                cumulativeToolCalls: currentToolCallsCount,
                cumulativeToolCallDetails: currentToolCallDetails // Pass updated details array
            });

        } else {
            // Handle Final Response (finishReason is not 'tool_calls' or no tool_calls present)
            this.logger.log(`(Depth ${depth}) Received final response. Finish Reason: ${finishReason}`);
            const rawContent = assistantMessageFromAPI.content;
            let finalResultContent: any = null;

            if (rawContent !== null && rawContent !== undefined) {
                const requestedFormat = requestOptions.responseFormat;
                if ((requestedFormat?.type === 'json_object' || requestedFormat?.type === 'json_schema') && typeof rawContent === 'string') {
                    this.logger.debug(`(Depth ${depth}) Final response: JSON format requested, attempting parse/validation...`);
                    try {
                        finalResultContent = this._parseAndValidateJsonResponse(rawContent, requestedFormat, strictJsonParsing);
                    } catch (parseValidationError) {
                        currentApiCallMetadata.finishReason = mapError(parseValidationError).code || 'error_json_validation';
                        // Include accumulated tool details in the error response
                        return {
                            content: null, usage: currentCumulativeUsage, model: responseModel,
                            toolCallsCount: currentToolCallsCount,
                            toolCalls: currentToolCallDetails,
                            finishReason: currentApiCallMetadata.finishReason,
                            id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                            annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [assistantMessageWithTimestamp]
                        };
                    }
                } else if (requestedFormat && typeof rawContent !== 'string') {
                    this.logger.warn(`(Depth ${depth}) Final response: JSON format requested, but content was not a string (type: ${typeof rawContent}). Raw content:`, rawContent);
                    if (strictJsonParsing) {
                        currentApiCallMetadata.finishReason = 'error_invalid_json_type';
                        return {
                            content: null, usage: currentCumulativeUsage, model: responseModel,
                            toolCallsCount: currentToolCallsCount,
                            toolCalls: currentToolCallDetails,
                            finishReason: currentApiCallMetadata.finishReason,
                            id: currentApiCallMetadata.callId, cost: cumulativeCost, reasoning: null,
                            annotations: [], apiCallMetadata: currentApiCallMetadata, newlyAddedMessages: [assistantMessageWithTimestamp]
                        };
                    } else {
                        finalResultContent = null; // Or maybe the raw content? Decided null for consistency.
                    }
                } else {
                    // Not JSON requested or content is already structured (less common for final response)
                    finalResultContent = rawContent;
                }
            } else {
                this.logger.log(`(Depth ${depth}) Final response content is null or undefined. Finish reason: ${finishReason}`);
                finalResultContent = null;
            }

            this.logger.debug(`(Depth ${depth}) Final processed result content:`, finalResultContent);

            const finalAssistantMessage = newlyAddedMessages[0]; // The assistant's final message
            const reasoning = finalAssistantMessage?.reasoning ?? null;
            const annotations = finalAssistantMessage?.annotations ?? [];

            // Return the final result including accumulated tool call details
            return {
                content: finalResultContent,
                usage: currentCumulativeUsage,
                model: responseModel,
                toolCallsCount: currentToolCallsCount,
                toolCalls: currentToolCallDetails, // Include the details
                finishReason: finishReason,
                id: responseData.id,
                cost: cumulativeCost,
                reasoning: reasoning,
                annotations: annotations,
                apiCallMetadata: currentApiCallMetadata,
                newlyAddedMessages: newlyAddedMessages, // Include the final assistant message
            };
        }
    }

    // _parseAndValidateJsonResponse remains the same
    private _parseAndValidateJsonResponse(
        rawContent: string,
        requestedFormat: ResponseFormat,
        strictJsonParsing: boolean
    ): any {
        if (!requestedFormat?.type) {
            this.logger.warn('_parseAndValidateJsonResponse called without a valid requestedFormat type. Returning raw content.');
            return rawContent;
        }

        const formatType = requestedFormat.type;
        const schema = formatType === 'json_schema' ? requestedFormat.json_schema?.schema : undefined;
        const entityName = `API response (format ${formatType})`;
        this.logger.debug(`Parsing and validating ${entityName}... Strict mode: ${strictJsonParsing}`);

        try {
            const parsedJson = jsonUtils.parseOrThrow(rawContent, entityName, { logger: this.logger });

            if (formatType === 'json_schema' && schema) {
                const schemaName = requestedFormat.json_schema?.name || '<no name>';
                this.logger.debug(`Validating response against JSON schema '${schemaName}'...`);
                jsonUtils.validateJsonSchema(parsedJson, schema, entityName, { logger: this.logger });
                this.logger.debug(`Response passed JSON schema validation ('${schemaName}').`);
            } else if (formatType === 'json_object') {
                if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
                    throw new ValidationError(`${entityName} validation error: expected a JSON object, but got ${Array.isArray(parsedJson) ? 'array' : typeof parsedJson}`);
                }
                this.logger.debug(`Response is a valid JSON object.`);
            }
            return parsedJson;
        } catch (error) {
            const validationError = mapError(error);
            this.logger.error(`Error processing JSON response (${formatType}): ${validationError.message}`, validationError.details);

            if (strictJsonParsing) {
                throw validationError;
            } else {
                this.logger.warn(`Returning null due to JSON response processing error (strictJsonParsing=false).`);
                return null;
            }
        }
    }
}