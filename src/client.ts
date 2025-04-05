// Path: src/client.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosHeaders, AxiosHeaderValue } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  OpenRouterConfig,
  OpenRouterRequestOptions,
  OpenRouterResponse,
  Message,
  Tool,
  ResponseFormat,
  HistoryStorageType,
  UserAuthInfo,
  SecurityConfig,
  ProviderPreferences,
  ToolCall,
  UsageInfo,
  ChatCompletionResult,
  CreditBalance,
  ModelPricingInfo
} from './types';
import { HistoryManager } from './history-manager';
import { ToolHandler } from './tool-handler';
import { formatMessages, formatResponseForDisplay, formatDateTime } from './utils/formatting';
import { validateConfig } from './utils/validation';
import {
    mapError,
    OpenRouterError,
    ErrorCode,
    ConfigError,
    AuthorizationError,
    APIError,
    RateLimitError,
    SecurityError,
    AuthenticationError,
    AccessDeniedError,
    ValidationError,
    TimeoutError,
    NetworkError,
    ToolError
} from './utils/error';
import * as jsonUtils from './utils/json-utils';
import { Logger } from './utils/logger';
import {
  API_ENDPOINT,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT,
  DEFAULT_TEMPERATURE,
  MAX_HISTORY_ENTRIES,
  DEFAULT_CHATS_FOLDER
} from './config';
import { SecurityManager } from './security/security-manager';
import { SimpleEventEmitter } from './utils/simple-event-emitter';
import { CostTracker } from './cost-tracker';

const DEFAULT_REFERER_URL = "https://github.com/mmeerrkkaa/openrouter-kit";
const DEFAULT_X_TITLE = "openrouter-kit";

const DEFAULT_MAX_TOOL_CALLS = 10;
const CREDITS_API_PATH = '/auth/key';

// Helper to sum usage info
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

interface HandleApiResponseResult {
    content: any;
    usage: UsageInfo | null;
    model: string;
    toolCallsCount: number;
    finishReason: string | null;
    id?: string;
    cost?: number | null;
}


export class OpenRouterClient {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;
  private debug: boolean;
  private proxy: string | { host: string; port: number; user?: string; pass?: string } | null;
  private headers: Record<string, string>;
  // legacy historyManager removed
  /**
   * Optional unified history manager with pluggable storage adapter
   */
  private unifiedHistoryManager?: import('./history/unified-history-manager').UnifiedHistoryManager;
  private providerPreferences?: ProviderPreferences;
  private modelFallbacks: string[];
  private enableReasoning: boolean;
  private webSearch: boolean;
  private axiosInstance: AxiosInstance;
  private defaultResponseFormat: ResponseFormat | null;
  private securityManager: SecurityManager | null;
  private logger: Logger;
  private strictJsonParsing: boolean;
  private clientEventEmitter: SimpleEventEmitter;
  private axiosConfig?: AxiosRequestConfig;
  private defaultMaxToolCalls: number;
  private costTracker: CostTracker | null;
  private plugins: import('./types').OpenRouterPlugin[] = [];
  private middlewares: import('./types').MiddlewareFunction[] = [];
  // duplicate plugin/middleware fields removed
  private apiBaseUrl: string;

  constructor(config: OpenRouterConfig) {
    validateConfig(config);

    this.debug = config.debug ?? false;
    this.logger = new Logger({ debug: this.debug, prefix: 'OpenRouterClient' });
    jsonUtils.setJsonUtilsLogger(this.logger.withPrefix('JsonUtils'));
    this.clientEventEmitter = new SimpleEventEmitter();

    // Initialize history manager: unified with adapter or legacy
    if (config.historyAdapter) {
      this.logger.log('Using UnifiedHistoryManager with custom adapter');
      const { UnifiedHistoryManager } = require('./history/unified-history-manager');
      this.unifiedHistoryManager = new UnifiedHistoryManager(config.historyAdapter, {
        ttlMs: config.historyTtl,
        cleanupIntervalMs: config.historyCleanupInterval,
        autoSave: config.historyAutoSave,
      });
    } else {
      this.logger.log('Legacy HistoryManager removed');
    }
    this.logger.log('Initializing OpenRouter Kit...');

    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint || API_ENDPOINT;
    this.model = config.model || DEFAULT_MODEL;
    this.axiosConfig = config.axiosConfig;
    this.defaultMaxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;

    try {
        const url = new URL(this.apiEndpoint || API_ENDPOINT);
        const v1Index = url.pathname.indexOf('/v1/');
        let basePath = '/api/v1';
        if (v1Index !== -1) {
            basePath = url.pathname.substring(0, v1Index + '/v1'.length);
        } else {
             this.logger.warn(`Could not reliably determine '/v1/' base path from apiEndpoint: ${this.apiEndpoint}. Using default: ${basePath}`);
        }
        this.apiBaseUrl = `${url.protocol}//${url.host}${basePath}`;
        this.logger.debug(`Determined API base URL for related endpoints: ${this.apiBaseUrl}`);
    
    } catch (e) {
         this.logger.error(`Failed to parse apiEndpoint to determine base URL: ${this.apiEndpoint}. Using default.`);
         this.apiBaseUrl = 'https://openrouter.ai/api/v1';
    }

    let processedProxy: typeof this.proxy = null;
     if (config.proxy) {
         if (typeof config.proxy === 'string') {
             processedProxy = config.proxy;
         } else if (typeof config.proxy === 'object' && config.proxy !== null) {
             let portNumber: number;
             if (typeof config.proxy.port === 'string') {
                 portNumber = parseInt(config.proxy.port, 10);
                 if (isNaN(portNumber)) {
                     this.logger.error(`Internal validation inconsistency: Proxy port string '${config.proxy.port}' failed parsing after validation. Disabling proxy.`);
                     portNumber = 0;
                 }
             } else {
                 portNumber = config.proxy.port;
             }

             if (portNumber > 0) {
                 processedProxy = {
                     ...config.proxy,
                     port: portNumber,
                 };
             } else {
                  processedProxy = null;
             }
         }
     }
     this.proxy = processedProxy;


    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': config.referer ?? DEFAULT_REFERER_URL,
      'X-Title': config.title ?? DEFAULT_X_TITLE,
    };

     if (config.axiosConfig?.headers) {
         for (const [key, value] of Object.entries(config.axiosConfig.headers)) {
              if (typeof value === 'string' && key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'content-type') {
                  this.headers[key] = value;
              }
          }
     }

    this.logger.debug(`Using HTTP-Referer: ${this.headers['HTTP-Referer']}`);
    this.logger.debug(`Using X-Title: ${this.headers['X-Title']}`);


    this.strictJsonParsing = config.strictJsonParsing ?? false;

     const historyStorage: HistoryStorageType = config.historyStorage || 'memory';
     const chatsFolder = config.historyStorage === 'disk' ? (config.chatsFolder || DEFAULT_CHATS_FOLDER) : '';
     const maxHistory = config.maxHistoryEntries || (MAX_HISTORY_ENTRIES * 2);


    this.providerPreferences = config.providerPreferences || undefined;
    this.modelFallbacks = config.modelFallbacks || [];
    this.enableReasoning = config.enableReasoning || false;
    this.webSearch = config.webSearch || false;
    this.defaultResponseFormat = config.responseFormat || null;

     if (config.security) {
       this.securityManager = new SecurityManager(config.security, this.debug);
       this.logger.log('SecurityManager initialized.');
       if (this.debug) {
         const secureConfigLog = { ...config.security };
         if (secureConfigLog.userAuthentication?.jwtSecret) {
              secureConfigLog.userAuthentication = { ...secureConfigLog.userAuthentication, jwtSecret: '***REDACTED***' };
         }
         this.logger.debug('Security settings:', secureConfigLog);
       }
     } else {
       this.securityManager = null;
       this.logger.log('SecurityManager not used (security configuration missing).');
     }

    this.axiosInstance = this._createAxiosInstance();

    if (config.enableCostTracking) {
        this.logger.log('Cost tracking enabled. Initializing CostTracker...');
        this.costTracker = new CostTracker(this.axiosInstance, this.logger, {
            enableCostTracking: true,
            priceRefreshIntervalMs: config.priceRefreshIntervalMs,
            initialModelPrices: config.initialModelPrices,
            apiBaseUrl: this.apiBaseUrl
        });
    } else {
        this.costTracker = null;
        this.logger.log('Cost tracking disabled.');
    }

    this.logger.log('OpenRouter Kit successfully initialized.');
  }

  private _createAxiosInstance(): AxiosInstance {
    const baseAxiosConfig: AxiosRequestConfig = {
        baseURL: this.apiEndpoint,
        timeout: this.axiosConfig?.timeout ?? DEFAULT_TIMEOUT,
        headers: this.headers,
    };

     const mergedHeaders: Record<string, AxiosHeaderValue | undefined> = {
         ...baseAxiosConfig.headers,
         ...(this.axiosConfig?.headers || {}),
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${this.apiKey}`,
     };

     const mergedConfig: AxiosRequestConfig = {
         ...baseAxiosConfig,
         ...this.axiosConfig,
         headers: mergedHeaders as any
     };

     const axiosInstance = axios.create(mergedConfig);
     this.logger.debug('Axios instance created with config:', {
         ...mergedConfig,
         headers: {
              ...mergedHeaders,
              Authorization: mergedHeaders.Authorization ? 'Bearer ***REDACTED***' : undefined
         }
     });

     axiosInstance.interceptors.request.use(config => {
         config.headers = config.headers || new AxiosHeaders();
         config.headers['Authorization'] = `Bearer ${this.apiKey}`;

         if (this.proxy) {
             this.logger.debug('Using proxy:', typeof this.proxy === 'string' ? this.proxy : `${this.proxy.host}:${this.proxy.port}`);
             let proxyUrl: string;
             if (typeof this.proxy === 'object') {
                 const auth = this.proxy.user ? `${encodeURIComponent(this.proxy.user)}:${encodeURIComponent(this.proxy.pass || '')}@` : '';
                 proxyUrl = `http://${auth}${this.proxy.host}:${this.proxy.port}`;
             } else {
                 proxyUrl = this.proxy;
             }
              config.httpsAgent = new HttpsProxyAgent(proxyUrl);
              config.proxy = false;
         }

        if (this.debug) {
          const headersToLog = { ...config.headers.toJSON() };
          if (headersToLog?.Authorization) {
              headersToLog.Authorization = 'Bearer ***REDACTED***';
          }
          const dataSummary = config.data && typeof config.data === 'object'
              ? { model: config.data.model, messagesCount: config.data.messages?.length, toolsCount: config.data.tools?.length, otherKeys: Object.keys(config.data).filter(k => !['model', 'messages', 'tools'].includes(k)) }
              : typeof config.data;

          this.logger.debug('Axios Request ->', {
            method: config.method?.toUpperCase(),
            url: config.url ? (config.baseURL ? `${config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}` : config.url) : config.baseURL,
            headers: headersToLog,
            dataSummary: dataSummary
          });
        }
        return config;
     }, error => {
         const mappedError = mapError(error);
         this.logger.error('Axios Request Error:', mappedError.message, mappedError.details);
         this._handleError(mappedError);
         return Promise.reject(mappedError);
     });

      axiosInstance.interceptors.response.use(response => {
        if (this.debug) {
          this.logger.debug('Axios Response <-', {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            dataSummary: { id: response.data?.id, model: response.data?.model, choicesCount: response.data?.choices?.length, usage: response.data?.usage, error: response.data?.error }
          });
        }
        return response;
      }, error => {
         const mappedError = mapError(error);
         if (this.debug) {
              this.logger.error('Axios Response Error <-', {
                message: mappedError.message,
                code: mappedError.code,
                statusCode: mappedError.statusCode,
                details: mappedError.details,
              });
         }
         this._handleError(mappedError);
         return Promise.reject(mappedError);
      });

    return axiosInstance;
  }


  async chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult> {
    const ctx: import('./types').MiddlewareContext = {
      request: { options },
      metadata: {}
    };

    await this._runMiddlewares(ctx, async () => {
      try {
        const result = await this._chatInternal(ctx.request.options);
        ctx.response = { ...(ctx.response || {}), result };
      } catch (err) {
        ctx.response = { ...(ctx.response || {}), error: err };
      }
    });

    if (ctx.response?.error) throw ctx.response.error;
    if (ctx.response?.result) return ctx.response.result;
    throw new Error('Chat middleware chain did not produce a result');
  }

  private async _chatInternal(options: OpenRouterRequestOptions): Promise<ChatCompletionResult> {
    const startTime = Date.now();
    if (!options.customMessages && !options.prompt) {
        throw new ConfigError("'prompt' or 'customMessages' must be provided in options");
    }
    const logIdentifier = options.prompt
        ? `prompt: "${options.prompt.substring(0, 50)}..."`
        : `customMessages: ${options.customMessages?.length ?? 0}`;
    this.logger.log(`Starting chat(${logIdentifier})...`);

    const strictJsonParsing = options.strictJsonParsing ?? this.strictJsonParsing;
    const modelToUse = options.model || this.model;
    const tools = options.tools || null;
    const maxToolCalls = options.maxToolCalls ?? this.defaultMaxToolCalls;

     const {
       user,
       group = null,
       prompt = '',
       systemPrompt = null,
       responseFormat = this.defaultResponseFormat,
       temperature = DEFAULT_TEMPERATURE,
       maxTokens = null,
       customMessages = null,
       accessToken = null,
       topP = null,
       presencePenalty = null,
       frequencyPenalty = null,
       stop = null,
       logitBias = null,
       seed = null,
       toolChoice = null,
       parallelToolCalls = undefined,
       route = undefined,
       transforms = undefined,
     } = options;

     let userInfo: UserAuthInfo | null = null;
     if (this.securityManager) {
         if (accessToken) {
             try {
                 userInfo = await this.securityManager.authenticateUser(accessToken);
                 if (userInfo) {
                     this.logger.log(`User authenticated: userId=${userInfo.userId}`);
                 } else {
                     if (this.securityManager.getConfig().requireAuthentication) {
                          this.logger.warn(`Authentication failed (token invalid or not found), but it's required.`);
                          throw new AuthenticationError('Valid access token (accessToken) is required and the one provided is invalid or expired.', 401);
                     } else {
                          this.logger.debug(`Authentication failed, but it's not required. Request will proceed as anonymous.`);
                     }
                 }
             } catch (authError) {
                 const mappedAuthError = mapError(authError);
                 this.logger.error('User authentication error:', mappedAuthError.message);
                  this._handleError(mappedAuthError);
                  throw mappedAuthError;
             }
         } else if (this.securityManager.getConfig().requireAuthentication) {
             this.logger.warn('Authentication required (requireAuthentication=true), but accessToken not provided.');
             throw new AuthorizationError('Access token (accessToken) is required for this operation.', 401);
         } else {
              this.logger.debug('accessToken not provided, authentication not required. Request will proceed as anonymous.');
         }
     } else if (accessToken) {
          this.logger.warn('accessToken provided, but SecurityManager not configured. Token will be ignored.');
     }

    // --- Main Execution ---
    let conversationHistory: Message[] = []; // Stores history loaded initially
    let messagesForApi: Message[] = [];    // Array passed to API and modified
    let initialHistoryLength = 0;          // Length BEFORE adding current turn

    try {
        // 1. Load initial history (if user provided and not using customMessages)
        if (user && !customMessages) {
            const historyKey = this._getHistoryKey(user, group);
            try {
                // Get history returns a COPY, so it's safe to store
                conversationHistory = await this.unifiedHistoryManager!.getHistory(historyKey);
                this.logger.debug(`Loaded ${conversationHistory.length} messages from history for key '${historyKey}'.`);
            } catch (histError) {
                this.logger.error(`Error loading history for key '${historyKey}':`, histError);
                conversationHistory = []; // Start fresh on error
            }
        }
        initialHistoryLength = conversationHistory.length; // Length BEFORE adding current turn

        // 2. Prepare messages for the API call (adds current prompt/system prompt to history)
        // Pass the loaded history to _prepareMessages
        messagesForApi = await this._prepareMessages({
            user, group, prompt, systemPrompt, customMessages,
            _loadedHistory: conversationHistory // Pass pre-loaded history
        });

        // 3. Build the request body
        const initialRequestBody = this._buildRequestBody({
            model: modelToUse,
            messages: messagesForApi, // Use the prepared messages
            tools: tools?.map(ToolHandler.formatToolForAPI) || null,
            responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed, toolChoice,
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined,
            route, transforms
        });

        // 4. Send the first request
        const initialResponse = await this._sendRequest(initialRequestBody, 0);

        // Options for subsequent recursive requests
        const recursiveRequestOptions: Partial<OpenRouterRequestOptions> & { model: string } = {
            model: modelToUse,
            temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed, route, transforms, responseFormat,
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined
        };

        // 5. Handle the response (modifies messagesForApi by adding assistant/tool messages)
        const handleResult = await this._handleApiResponse({
            response: initialResponse,
            currentMessages: messagesForApi, // Pass the array to be modified
            tools: tools || undefined,
            userInfo,
            strictJsonParsing,
            depth: 0,
            requestOptions: recursiveRequestOptions,
            maxToolCalls,
            cumulativeUsage: null,
            cumulativeToolCalls: 0
        });

        // --- History Saving ---
        if (user) { // Save only if user is specified
            const historyKey = this._getHistoryKey(user, group);
            // messagesForApi now contains: initial history + current turn messages
            // Slice from the end of the initial history to get only the current turn's messages
            const messagesToSave = messagesForApi.slice(initialHistoryLength);

            if (messagesToSave.length > 0) {
                // AddMessages handles trimming internally
                await this.unifiedHistoryManager!.addMessages(historyKey, messagesToSave);
                this.logger.debug(`Saved conversation turn (${messagesToSave.length} messages) to history for key '${historyKey}'.`);
            } else {
                this.logger.debug(`No new messages to save for history key '${historyKey}'.`);
            }
        }

        const duration = Date.now() - startTime;
        this.logger.log(`Chat request (${logIdentifier}) completed fully in ${duration} ms.`);

        // Construct the final result object
        const finalResult: ChatCompletionResult = {
            content: handleResult.content,
            usage: handleResult.usage,
            model: handleResult.model,
            toolCallsCount: handleResult.toolCallsCount,
            finishReason: handleResult.finishReason,
            durationMs: duration,
            id: handleResult.id,
            cost: handleResult.cost
        };

        return finalResult;

    } catch (error) {
       const mappedError = mapError(error);
       this.logger.error(`Error in chat execution flow: ${mappedError.message}`, mappedError.details || mappedError);
       this._handleError(mappedError);

       // Attempt to save history even on error
       if (user && messagesForApi.length > initialHistoryLength) { // Check if anything was added after initial load
           const historyKey = this._getHistoryKey(user, group);
          
           const messagesToSaveOnError = messagesForApi.slice(initialHistoryLength);
           if (messagesToSaveOnError.length > 0) {
                this.unifiedHistoryManager!.addMessages(historyKey, messagesToSaveOnError)
                    .catch(histErr => this.logger.error(`Failed to save partial history on error for key ${historyKey}:`, histErr));
           }
       }
       throw mappedError;
    }
  }

   private async _prepareMessages(params: {
     user?: string; group?: string | null; prompt: string; systemPrompt?: string | null; customMessages?: Message[] | null;
     _loadedHistory?: Message[]; // Internal: Pass pre-loaded history
   }): Promise<Message[]> {
     const { user, group, prompt, systemPrompt, customMessages, _loadedHistory } = params;

     if (customMessages) {
        this.logger.debug(`Using provided customMessages (${customMessages.length} items).`);
         let finalMessages = [...customMessages];
         const hasSystem = finalMessages.some(m => m.role === 'system');
         if (systemPrompt && !hasSystem) {
             this.logger.debug('Prepending systemPrompt to customMessages.');
             finalMessages.unshift({ role: 'system', content: systemPrompt });
         } else if (systemPrompt && hasSystem) {
              this.logger.warn('Both `systemPrompt` and a system message in `customMessages` were provided. Using the one from `customMessages`.');
         }
         return finalMessages.map(m => ({ ...m, content: m.content ?? null }));
     }

     if (!prompt && !systemPrompt) {
         // If _loadedHistory exists, we might still proceed, but log a warning
         if (!_loadedHistory || _loadedHistory.length === 0) {
             throw new ConfigError("'prompt' must be provided if 'customMessages' is not used and history is empty");
         } else {
              this.logger.warn("Neither 'prompt' nor 'systemPrompt' provided, proceeding with history only.");
         }
     }

     let messages: Message[] = [];

     // Use pre-loaded history if available
     if (_loadedHistory) {
         this.logger.debug(`Using pre-loaded history (${_loadedHistory.length} messages). Filtering...`);
         // Filter the history copy for the API
         const filteredHistory = this._filterHistoryForApi(_loadedHistory);
         messages = [...messages, ...filteredHistory];
         this.logger.debug(`Added ${filteredHistory.length} filtered messages from pre-loaded history.`);
     }
     // Fallback: Load history if user provided but not pre-loaded (should ideally not happen if chat() preloads)
     else if (user) {
       const historyKey = this._getHistoryKey(user, group);
       this.logger.warn(`_prepareMessages loading history for key '${historyKey}' (ideally should be pre-loaded by chat()).`);
       try {
           const history = await this.unifiedHistoryManager!.getHistory(historyKey);
           if (history.length > 0) {
               this.logger.debug(`History loaded for key '${historyKey}', records: ${history.length}. Filtering...`);
               const filteredHistory = this._filterHistoryForApi(history);
               messages = [...messages, ...filteredHistory];
               this.logger.debug(`Added ${filteredHistory.length} filtered messages from history.`);
           } else {
                this.logger.debug(`History for key '${historyKey}' empty or not found.`);
           }
       } catch (histError) {
           this.logger.error(`Error loading history for key '${historyKey}':`, histError);
       }
     } else {
         this.logger.debug('User not specified, history not loaded.');
     }

     // Add system prompt *after* history if it exists and there's no system message already
     if (systemPrompt && !messages.some(m => m.role === 'system')) {
         messages.unshift({ role: 'system', content: systemPrompt });
     }

     // Add the current user prompt if provided
     if (prompt) {
         messages.push({ role: 'user', content: prompt });
     }

     this.logger.debug(`${messages.length} messages prepared for API request.`);
     // Ensure content is null if undefined/missing before returning
     return messages.map(m => ({ ...m, content: m.content ?? null }));
   }

   private _filterHistoryForApi(messages: Message[]): Message[] {
       return messages.map(msg => {
           const filteredMsg: Partial<Message> = { role: msg.role };
           if (msg.content !== undefined) filteredMsg.content = msg.content;
           if (msg.tool_calls) filteredMsg.tool_calls = msg.tool_calls;
           if (msg.tool_call_id) filteredMsg.tool_call_id = msg.tool_call_id;
           if (msg.name) filteredMsg.name = msg.name;
           return filteredMsg as Message;
       }).filter(msg => msg !== null);
   }

   private _buildRequestBody(params: {
     model: string;
     messages: Message[];
     tools?: Tool[] | null;
     responseFormat?: ResponseFormat | null;
     temperature?: number;
     maxTokens?: number | null;
     topP?: number | null;
     presencePenalty?: number | null;
     frequencyPenalty?: number | null;
     stop?: string | string[] | null;
     logitBias?: Record<string, number> | null;
     seed?: number | null;
     toolChoice?: OpenRouterRequestOptions['toolChoice'] | null;
     parallelToolCalls?: boolean;
     route?: string;
     transforms?: string[];
   }): Record<string, any> {
     const {
         model,
         messages, tools,
         responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
         stop, logitBias, seed, toolChoice, parallelToolCalls, route, transforms
     } = params;

     // Filter messages just before sending to API
     const apiMessages = this._filterHistoryForApi(messages);

     const body: Record<string, any> = {
       model: model,
       messages: apiMessages, // Use filtered messages
       ...(temperature !== undefined && { temperature: temperature }),
     };

     if (maxTokens != null && maxTokens > 0) body.max_tokens = maxTokens;
     if (topP != null) body.top_p = topP;
     if (presencePenalty != null) body.presence_penalty = presencePenalty;
     if (frequencyPenalty != null) body.frequency_penalty = frequencyPenalty;
     if (stop != null && (typeof stop === 'string' && stop !== '' || Array.isArray(stop) && stop.length > 0)) body.stop = stop;
     if (logitBias != null && Object.keys(logitBias).length > 0) body.logit_bias = logitBias;
     if (seed != null) body.seed = seed;

     if (tools && tools.length > 0) {
         body.tools = tools.map(t => ({ type: t.type, function: t.function }));
         if (toolChoice != null) {
              body.tool_choice = toolChoice;
          } else {
              body.tool_choice = 'auto';
          }
         body.parallel_tool_calls = parallelToolCalls ?? true;
     } else {
          if (toolChoice === 'none') {
              body.tool_choice = 'none';
          }
     }

     if (responseFormat) {
       if (responseFormat.type === 'json_object') {
            body.response_format = { type: 'json_object' };
            this.logger.debug('Requested response format: json_object');
       } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema?.schema && responseFormat.json_schema?.name) {
           body.response_format = { type: 'json_schema', json_schema: responseFormat.json_schema };
           this.logger.debug(`Requested response format: json_schema (name: ${responseFormat.json_schema.name})`);
       } else if (responseFormat.type === 'json_schema') {
           this.logger.warn('Invalid responseFormat for json_schema: missing `json_schema` object with `name` and `schema`. Ignored.', responseFormat);
       } else {
            this.logger.warn('Unknown responseFormat type. Ignored.', responseFormat);
       }
     }

     if (route) body.route = route;
     if (transforms && transforms.length > 0) body.transforms = transforms;
     if (this.providerPreferences) body.provider = this.providerPreferences;
     if (this.modelFallbacks.length > 0) {
         body.models = [model, ...this.modelFallbacks];
         this.logger.debug(`Using fallback models: ${body.models.join(', ')}`);
     }

     return body;
   }

   private async _sendRequest(requestBody: Record<string, any>, depth: number): Promise<AxiosResponse<OpenRouterResponse>> {
      this.logger.debug(`(Depth ${depth}) Sending request to API...`);

      if (this.debug && depth > 0) {
          try {
              const messagesString = JSON.stringify(requestBody.messages, null, 2);
              this.logger.debug(`(Depth ${depth}) Request Body Messages being sent:\n${messagesString}`);
              const otherKeys = Object.keys(requestBody).filter(k => k !== 'messages');
              const otherData = otherKeys.reduce((acc, key) => ({ ...acc, [key]: requestBody[key] }), {});
              this.logger.debug(`(Depth ${depth}) Other Request Body parts:`, otherData);
          } catch (e) {
              this.logger.error(`(Depth ${depth}) Failed to stringify requestBody for detailed logging:`, e);
              this.logger.debug(`(Depth ${depth}) Request Body (structure only):`, { model: requestBody.model, messagesCount: requestBody.messages?.length, toolsCount: requestBody.tools?.length });
          }
      } else if (this.debug) {
           this.logger.debug(`(Depth ${depth}) Request Body (structure only):`, { model: requestBody.model, messagesCount: requestBody.messages?.length, toolsCount: requestBody.tools?.length });
      }

      try {
          return await this.axiosInstance.post<OpenRouterResponse>('', requestBody);
      } catch (error) {
          throw mapError(error);
      }
   }

   private _parseAndValidateJsonResponse(
      rawContent: string,
      requestedFormat: ResponseFormat,
      strictJsonParsing: boolean
   ): any {
      const formatType = requestedFormat.type;
      const schema = requestedFormat.type === 'json_schema' ? requestedFormat.json_schema?.schema : undefined;
      const entityName = `API response (format ${formatType})`;
      this.logger.debug(`Parsing and validating ${entityName}... Strict mode: ${strictJsonParsing}`);

      try {
          const parsedJson = jsonUtils.parseOrThrow(rawContent, entityName, { logger: this.logger });

          if (formatType === 'json_schema' && schema) {
              this.logger.debug(`Validating response against JSON schema '${requestedFormat.json_schema?.name || '<no name>'}'...`);
              jsonUtils.validateJsonSchema(parsedJson, schema, entityName, { logger: this.logger });
              this.logger.debug(`Response passed JSON schema validation.`);
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

   private async _handleApiResponse(params: {
       response: AxiosResponse<OpenRouterResponse>;
       currentMessages: Message[]; // This array will be modified
       tools?: Tool[];
       userInfo?: UserAuthInfo | null;
       strictJsonParsing: boolean;
       depth: number;
       requestOptions: Partial<OpenRouterRequestOptions> & { model: string };
       maxToolCalls: number;
       cumulativeUsage: UsageInfo | null;
       cumulativeToolCalls: number;
   }): Promise<HandleApiResponseResult> {
       const {
           response, currentMessages, tools, userInfo, strictJsonParsing, depth,
           requestOptions, maxToolCalls, cumulativeUsage, cumulativeToolCalls
        } = params;

       const responseData = response.data;
       this.logger.debug(`(Depth ${depth}) Handling API response. Status: ${response.status}`);

       let currentCumulativeUsage = sumUsage(cumulativeUsage, responseData?.usage);
       if (responseData?.usage) this.logger.log(`(Depth ${depth}) Usage (this step):`, responseData.usage);
       this.logger.debug(`(Depth ${depth}) Cumulative Usage:`, currentCumulativeUsage);

       this.logger.debug(`(Depth ${depth}) API response data summary:`, { id: responseData?.id, model: responseData?.model, choicesCount: responseData?.choices?.length, usage: responseData?.usage, error: responseData?.error });

       if (responseData?.error) {
           const apiErrorData = responseData.error as any;
           const message = apiErrorData.message || `Unknown API error at depth ${depth}`;
           const code = apiErrorData.code || ErrorCode.API_ERROR;
           const statusCode = response.status || (typeof apiErrorData.status === 'number' ? apiErrorData.status : 500);
           this.logger.error(`(Depth ${depth}) API returned error in body:`, responseData.error);
           throw new APIError(message, statusCode, { code, details: apiErrorData, depth });
       }

       if (!responseData?.choices?.length) {
           this.logger.warn(`(Depth ${depth}) API response missing or empty "choices" array.`, responseData);
           throw new APIError(`API response at depth ${depth} lacks valid "choices"`, response.status || 500, responseData);
       }

       const choice = responseData.choices[0];
       const assistantMessageFromAPI = choice.message;

       if (assistantMessageFromAPI) {
           // Add the assistant's message (incl. tool_calls) to the conversation history being built
           currentMessages.push({ ...assistantMessageFromAPI, timestamp: formatDateTime() });
           this.logger.debug(`(Depth ${depth}) Added assistant message (role: ${assistantMessageFromAPI.role}) to current conversation.`);
       } else {
            this.logger.warn(`(Depth ${depth}) No message found in API response choice.`);
             throw new APIError(`API response choice at depth ${depth} missing 'message' field`, response.status || 500, responseData);
       }

       const finishReason = choice.finish_reason;
       let currentToolCallsCount = cumulativeToolCalls;

       if (finishReason === 'tool_calls' && assistantMessageFromAPI.tool_calls?.length && tools?.length) {
           const numberOfCalls = assistantMessageFromAPI.tool_calls.length;
           currentToolCallsCount += numberOfCalls;
           this.logger.log(`(Depth ${depth}) Tool calls requested (${numberOfCalls}). Total calls so far: ${currentToolCallsCount}. Processing...`);

           if (depth >= maxToolCalls) {
               this.logger.warn(`(Depth ${depth}) Maximum tool call depth (${maxToolCalls}) reached. Aborting loop.`);
               throw new ToolError(`Maximum tool call depth (${maxToolCalls}) exceeded. Aborting tool execution loop.`, { depth, maxToolCalls });
           }

           let toolResultsMessages: Message[] = [];
           try {
               toolResultsMessages = await ToolHandler.handleToolCalls({
                   message: assistantMessageFromAPI as Message & { tool_calls: ToolCall[] },
                   debug: this.debug,
                   tools: tools,
                   securityManager: this.securityManager || undefined,
                   userInfo: userInfo ?? null,
                   logger: this.logger.withPrefix(`ToolHandler(Depth ${depth})`),
                   parallelCalls: requestOptions.parallelToolCalls ?? true
               });
           } catch (toolHandlerError) {
               const mappedError = mapError(toolHandlerError);
               this.logger.error(`(Depth ${depth}) Error during tool execution: ${mappedError.message}`, mappedError.details);
               throw mappedError;
           }

           // Add the results from the tool executions to the conversation history
           toolResultsMessages.forEach(msg => currentMessages.push({ ...msg, timestamp: formatDateTime() }));
           this.logger.debug(`(Depth ${depth}) Added ${toolResultsMessages.length} tool result messages to current conversation.`);

           this.logger.log(`(Depth ${depth}) Sending tool results back to LLM...`);
           const nextRequestBody = this._buildRequestBody({
               ...requestOptions,
               model: requestOptions.model,
               messages: currentMessages, // Send the updated history
               tools: tools?.map(ToolHandler.formatToolForAPI) || null,
           });

           const nextResponse = await this._sendRequest(nextRequestBody, depth + 1);

           // Recursively handle the response
           return await this._handleApiResponse({
                ...params,
                response: nextResponse,
                currentMessages: currentMessages, // Pass the modified array
                depth: depth + 1,
                cumulativeUsage: currentCumulativeUsage,
                cumulativeToolCalls: currentToolCallsCount
           });

       } else {
           // Final response
           this.logger.log(`(Depth ${depth}) Received final response. Finish Reason: ${finishReason}`);
           const rawContent = assistantMessageFromAPI.content;
           let finalResultContent: any = null;

           if (rawContent !== null && rawContent !== undefined) {
               const requestedFormat = requestOptions.responseFormat;
               if ((requestedFormat?.type === 'json_object' || requestedFormat?.type === 'json_schema') && typeof rawContent === 'string') {
                   this.logger.debug(`(Depth ${depth}) Final response: JSON format requested, attempting parse/validation...`);
                   finalResultContent = this._parseAndValidateJsonResponse(rawContent, requestedFormat, strictJsonParsing);
               } else if (requestedFormat && typeof rawContent !== 'string') {
                   this.logger.warn(`(Depth ${depth}) Final response: JSON format requested, but content was not string (${typeof rawContent}).`, rawContent);
                   if (strictJsonParsing) {
                       throw new ValidationError(`Expected a JSON string response for format ${requestedFormat.type}, received type ${typeof rawContent}.`);
                   } else {
                       finalResultContent = null;
                   }
               } else {
                   finalResultContent = rawContent;
               }
           } else {
               this.logger.log(`(Depth ${depth}) Final response content is null or undefined. Finish reason: ${finishReason}`);
               finalResultContent = null;
           }

           this.logger.debug(`(Depth ${depth}) Final processed result:`, finalResultContent);

           const cost = this.costTracker?.calculateCost(responseData.model, currentCumulativeUsage) ?? null;

           return {
               content: finalResultContent,
               usage: currentCumulativeUsage,
               model: responseData.model,
               toolCallsCount: currentToolCallsCount,
               finishReason: finishReason,
               id: responseData.id,
               cost: cost
           };
       }
   }


  private _handleError(error: OpenRouterError): void {
    const finalError = mapError(error);
    this.clientEventEmitter.emit('error', finalError);
  }

  private _getHistoryKey(user: string, group?: string | null): string {
    if (!user || typeof user !== 'string') {
       throw new ConfigError('User ID must be a non-empty string for history management.');
    }
    const safeUser = user.replace(/[:/\\?#%]/g, '_');
    let key = `user:${safeUser}`;
    if (group && typeof group === 'string') {
        const safeGroup = group.replace(/[:/\\?#%]/g, '_');
        key = `group:${safeGroup}_${key}`;
    }
    return key;
  }

  public getHistoryManager(): import('./history/unified-history-manager').UnifiedHistoryManager | HistoryManager {
    return this.unifiedHistoryManager!;
  }
  public getHistoryStorageType(): HistoryStorageType { return 'memory'; }
  public isDebugMode(): boolean { return this.debug; }
  public getSecurityManager(): SecurityManager | null { return this.securityManager; }
  public isSecurityEnabled(): boolean { return this.securityManager !== null; }
  public getCostTracker(): CostTracker | null { return this.costTracker; }

  public setModel(model: string): void {
    if (!model || typeof model !== 'string') {
        throw new ConfigError('Model name must be a non-empty string');
    }
    this.logger.log(`Default model changed from '${this.model}' to '${model}'`);
    this.model = model;
  }

  public setApiKey(apiKey: string): void {
    if (!apiKey || typeof apiKey !== 'string') {
        throw new ConfigError('API key must be a non-empty string');
    }
    this.logger.log('Updating API key...');
    this.apiKey = apiKey;
    const authHeader = `Bearer ${this.apiKey}`;
    this.headers['Authorization'] = authHeader;
    if (this.axiosInstance?.defaults?.headers) {
        if (this.axiosInstance.defaults.headers.common) {
             this.axiosInstance.defaults.headers.common['Authorization'] = authHeader;
        } else {
             (this.axiosInstance.defaults.headers as Record<string, any>)['Authorization'] = authHeader;
        }
    }
    this.logger.log('API key successfully updated for subsequent requests.');
  }

  public createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string {
    if (!this.securityManager) {
        throw new ConfigError('Cannot create token: SecurityManager not configured.');
    }
     this.logger.log(`Requesting access token creation for user ${userInfo.userId} (validity: ${expiresIn ?? 'default'})...`);
    try {
        return this.securityManager.createAccessToken(userInfo, expiresIn);
    } catch (error) {
         throw mapError(error);
    }
  }

  public async getCreditBalance(): Promise<CreditBalance> {
      if (!this.apiKey) {
          throw new ConfigError('Cannot fetch credit balance: API key is not set.');
      }
      const creditsUrl = `${this.apiBaseUrl}${CREDITS_API_PATH}`;
      this.logger.log(`Fetching credit balance from ${creditsUrl}...`);

      try {
          const response = await this.axiosInstance.get(creditsUrl);

          if (response.status === 200 && response.data?.data) {
              const data = response.data.data;
              if (typeof data.limit === 'number' && typeof data.usage === 'number') {
                  const balance: CreditBalance = {
                      limit: data.limit,
                      usage: data.usage,
                  };
                  this.logger.log(`Credit balance fetched: Limit=${balance.limit}, Usage=${balance.usage}`);
                  return balance;
              } else {
                   this.logger.error('Invalid credit balance data received:', data);
                   throw new APIError('Invalid data format received for credit balance', response.status, data);
              }
          } else {
              this.logger.error(`Failed to fetch credit balance: Status ${response.status}`, response.data);
              throw new APIError(`Failed to fetch credit balance: Status ${response.status}`, response.status, response.data);
          }
      } catch (error) {
          const mappedError = mapError(error);
          this.logger.error(`Error fetching credit balance: ${mappedError.message}`, mappedError.details);
          throw mappedError;
      }
  }

   public getModelPrices(): Record<string, ModelPricingInfo> {
       if (!this.costTracker) {
           this.logger.warn("Cannot get model prices: Cost tracking is disabled.");
           return {};
       }
       return this.costTracker.getAllModelPrices();
   }

   public async refreshModelPrices(): Promise<void> {
        if (!this.costTracker) {
            this.logger.warn("Cannot refresh model prices: Cost tracking is disabled.");
            return;
        }
        await this.costTracker.fetchModelPrices();
   }


  public on(event: 'error', handler: (error: OpenRouterError) => void): this;
  public on(event: string, handler: (event: any) => void): this;
  public on(event: string, handler: (event: any) => void): this {
    if (event === 'error') {
        this.clientEventEmitter.on(event, handler as (error: OpenRouterError) => void);
        this.logger.debug(`Added client event handler for: ${event}`);
    } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:'))) {
        this.logger.debug(`Adding security event handler for: ${event}`);
        this.securityManager.on(event, handler);
    } else {
         this.logger.warn(`Attempting to subscribe to unknown or non-security event type '${event}'. Use 'error' for client errors or security-prefixed events for SecurityManager.`);
    }
    return this;
  }

   public off(event: 'error', handler: (error: OpenRouterError) => void): this;
   public off(event: string, handler: (event: any) => void): this;
   public off(event: string, handler: (event: any) => void): this {
       if (event === 'error') {
           this.clientEventEmitter.off(event, handler as (error: OpenRouterError) => void);
           this.logger.debug(`Removed client event handler for: ${event}`);
       } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:'))) {
           this.logger.debug(`Removing security event handler for: ${event}`);
           this.securityManager.off(event, handler);
       } else {
            this.logger.warn(`Cannot remove handler for unknown or non-security event '${event}'.`);
       }
       return this;
   }

   public async destroy(): Promise<void> {
       this.logger.log('Destroying OpenRouterClient...');
       if (this.unifiedHistoryManager) {
           await this.unifiedHistoryManager.destroy();
           this.logger.debug('HistoryManager destroyed.');
       }
       if (this.securityManager) {
           this.securityManager.destroy();
           this.logger.debug('SecurityManager destroyed.');
       }
       if (this.costTracker) {
           this.costTracker.destroy();
           this.logger.debug('CostTracker destroyed.');
       }
       this.clientEventEmitter.removeAllListeners();
       this.logger.debug('Client event listeners removed.');
       this.logger.log('OpenRouterClient successfully destroyed.');
   }

   /** @deprecated */
  public async handleToolCalls(params: {
    message: Message & { tool_calls?: any[] };
    messages: Message[];
    tools?: Tool[];
    debug?: boolean;
    accessToken?: string;
  }): Promise<Message[]> {
     this.logger.warn("Method client.handleToolCalls() is deprecated and will be removed. Tool processing is integrated into client.chat(). Use the main chat method instead.");

     if (!params.message?.tool_calls?.length) {
          this.logger.warn("[handleToolCalls] Called without tool_calls in message. Returning empty array.");
          return [];
     }
     if (!params.tools || params.tools.length === 0) {
         this.logger.warn("[handleToolCalls] Called without tools defined. Tool execution cannot proceed.");
         throw new ToolError("Tool processing failed: No tools were defined to handle the request.");
     }

     let userInfo: UserAuthInfo | null = null;
     if (this.securityManager && params.accessToken) {
         try {
             userInfo = await this.securityManager.authenticateUser(params.accessToken);
             if (!userInfo && this.securityManager.getConfig().requireAuthentication) {
                  throw new AuthenticationError("Authentication required but failed for handleToolCalls.", 401);
             }
         } catch (error) {
             const mappedError = mapError(error);
             this.logger.error('[handleToolCalls] Authentication error:', mappedError);
             throw mappedError;
         }
     } else if (this.securityManager && this.securityManager.getConfig().requireAuthentication) {
          throw new AuthorizationError("Authentication required but accessToken not provided for handleToolCalls.", 401);
     }

     try {
        const toolResultsMessages = await ToolHandler.handleToolCalls({
           message: params.message as Message & { tool_calls: ToolCall[] },
           debug: params.debug ?? this.debug,
           tools: params.tools ?? [],
           securityManager: this.securityManager || undefined,
           userInfo: userInfo,
           logger: this.logger.withPrefix('ToolHandler(Deprecated)'),
           parallelCalls: true,
         });
         return toolResultsMessages;
     } catch (error) {
          const mappedError = mapError(error);
          this.logger.error(`[handleToolCalls] Error during tool processing: ${mappedError.message}`, mappedError.details);
          throw mappedError;
     }
  }

  /**
   * Returns the active history manager (unified or legacy)
   */
  // duplicate getHistoryManager removed

  // duplicate plugin/middleware methods removed

  /**
   * Register a plugin. Calls plugin.init(this).
   */
  public async use(plugin: import('./types').OpenRouterPlugin): Promise<void> {
    if (!plugin || typeof plugin.init !== 'function') {
      throw new Error('Invalid plugin: missing init() method');
    }
    await plugin.init(this);
    this.plugins.push(plugin);
    this.logger?.log?.(`Plugin registered: ${plugin.constructor?.name || 'anonymous plugin'}`);
  }

  /**
   * Register a middleware function.
   */
  public useMiddleware(fn: import('./types').MiddlewareFunction): void {
    if (typeof fn !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middlewares.push(fn);
    this.logger?.log?.(`Middleware registered: ${fn.name || 'anonymous'}`);
  }

  private async _runMiddlewares(ctx: import('./types').MiddlewareContext, coreFn: () => Promise<void>): Promise<void> {
    const stack = this.middlewares.slice();
    const dispatch = async (i: number): Promise<void> => {
      if (i < stack.length) {
        await stack[i](ctx, () => dispatch(i + 1));
      } else {
        await coreFn();
      }
    };
    await dispatch(0);
  }

  /**
   * Replace the SecurityManager instance (for plugins)
   */
  public setSecurityManager(securityManager: SecurityManager | null): void {
    this.securityManager = securityManager;
    this.logger?.log?.('SecurityManager replaced via plugin');
  }

  /**
   * Replace the CostTracker instance (for plugins)
   */
  public setCostTracker(costTracker: CostTracker | null): void {
    this.costTracker = costTracker;
    this.logger?.log?.('CostTracker replaced via plugin');
  }

} // End of OpenRouterClient class