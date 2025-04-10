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
  UserAuthInfo,
  SecurityConfig as BaseSecurityConfig, // Keep base type if needed elsewhere
  ProviderRoutingConfig,
  ToolCall,
  UsageInfo,
  ChatCompletionResult,
  CreditBalance,
  ModelPricingInfo,
  OpenRouterPlugin,
  MiddlewareFunction,
  MiddlewareContext,
  IHistoryStorage,
  PluginConfig,
  ReasoningConfig,
  UrlCitationAnnotation
} from './types';
import { ToolHandler } from './tool-handler';
import { formatMessages, formatResponseForDisplay, formatDateTime } from './utils/formatting';
import { validateConfig, validateProviderRoutingConfig, validateReasoningConfig } from './utils/validation';
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
  DEFAULT_CHATS_FOLDER
} from './config';
import { SecurityManager } from './security/security-manager';
import { SimpleEventEmitter } from './utils/simple-event-emitter';
import { CostTracker } from './cost-tracker';
import { UnifiedHistoryManager } from './history/unified-history-manager';
import { MemoryHistoryStorage } from './history/memory-storage';

const DEFAULT_REFERER_URL = "https://github.com/mmeerrkkaa/openrouter-kit";
const DEFAULT_X_TITLE = "openrouter-kit";

const DEFAULT_MAX_TOOL_CALLS = 10;
const CREDITS_API_PATH = '/auth/key';
const MODELS_API_PATH = '/models';

const DEFAULT_API_BASE_URL = 'https://openrouter.ai/api/v1';

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
    reasoning?: string | null;
    annotations?: UrlCitationAnnotation[];
}


export class OpenRouterClient {
  private apiKey: string;
  private apiEndpoint: string;
  private apiBaseUrl: string;
  private model: string;
  private debug: boolean;
  private proxy: string | { host: string; port: number; user?: string; pass?: string } | null;
  private headers: Record<string, string>;
  private unifiedHistoryManager: UnifiedHistoryManager;
  private defaultProviderRouting?: ProviderRoutingConfig;
  private modelFallbacks: string[];
  private axiosInstance: AxiosInstance;
  private defaultResponseFormat: ResponseFormat | null;
  private securityManager: SecurityManager | null;
  private logger: Logger;
  private strictJsonParsing: boolean;
  private clientEventEmitter: SimpleEventEmitter;
  private axiosConfig?: AxiosRequestConfig;
  private defaultMaxToolCalls: number;
  private costTracker: CostTracker | null;
  private plugins: OpenRouterPlugin[] = [];
  private middlewares: MiddlewareFunction[] = [];

  // Deprecated/Unused flags
  private enableReasoning: boolean;
  private webSearch: boolean;

  constructor(config: OpenRouterConfig) {
    validateConfig(config);

    // --- Initialize core components first ---
    this.debug = config.debug ?? false;
    this.logger = new Logger({ debug: this.debug, prefix: 'OpenRouterClient' });
    jsonUtils.setJsonUtilsLogger(this.logger.withPrefix('JsonUtils'));
    this.clientEventEmitter = new SimpleEventEmitter();
    this.logger.log('Initializing OpenRouter Kit...');

    // --- Initialize Managers and Configuration ---
    this.unifiedHistoryManager = this._initializeHistoryManager(config);
    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint || API_ENDPOINT;
    this.apiBaseUrl = DEFAULT_API_BASE_URL;
    this.logger.debug(`Using API base URL for auxiliary endpoints: ${this.apiBaseUrl}`);

    this.model = config.model || DEFAULT_MODEL;
    this.axiosConfig = config.axiosConfig;
    this.defaultMaxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;

    this.proxy = this._processProxyConfig(config);
    this.headers = this._initializeHeaders(config);

    this.strictJsonParsing = config.strictJsonParsing ?? false;

    this.defaultProviderRouting = config.defaultProviderRouting;
    this.modelFallbacks = config.modelFallbacks || [];
    this.defaultResponseFormat = config.responseFormat || null;

    // Deprecated flags initialization
    this.enableReasoning = config.enableReasoning || false;
    this.webSearch = config.webSearch || false;

    // --- Initialize components that might depend on others ---
    this.securityManager = this._initializeSecurityManager(config);
    this.axiosInstance = this._initializeAxiosInstance(config);
    this.costTracker = this._initializeCostTracker(config);

    this.logger.log('OpenRouter Kit successfully initialized.');
  }

  // --- Initialization Helpers ---

  private _initializeHistoryManager(config: OpenRouterConfig): UnifiedHistoryManager {
    let historyAdapter: IHistoryStorage;
    if (config.historyAdapter) {
        this.logger.log('Using custom history adapter for UnifiedHistoryManager.');
        historyAdapter = config.historyAdapter;
    } else {
        this.logger.log('No history adapter provided, defaulting to MemoryHistoryStorage.');
        const folder = config.historyStorage === 'disk' ? (config.chatsFolder || DEFAULT_CHATS_FOLDER) : undefined;
        if (folder) {
            this.logger.warn(`'historyStorage: disk' without 'historyAdapter' is deprecated. Using MemoryHistoryStorage. 'chatsFolder' ignored.`);
        }
        historyAdapter = new MemoryHistoryStorage();
    }
    const manager = new UnifiedHistoryManager(historyAdapter, {
        ttlMs: config.historyTtl,
        cleanupIntervalMs: config.historyCleanupInterval,
    }, this.logger.withPrefix('UnifiedHistoryManager'));
    this.logger.log(`UnifiedHistoryManager initialized with adapter: ${historyAdapter.constructor.name}`);
    return manager;
  }

  private _processProxyConfig(config: OpenRouterConfig): typeof this.proxy {
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
    if (processedProxy) {
      this.logger.log('Proxy configuration processed.');
    }
    return processedProxy;
  }

  private _initializeHeaders(config: OpenRouterConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': config.referer ?? DEFAULT_REFERER_URL,
      'X-Title': config.title ?? DEFAULT_X_TITLE,
    };

    if (config.axiosConfig?.headers) {
        for (const [key, value] of Object.entries(config.axiosConfig.headers)) {
             if (typeof value === 'string' && key.toLowerCase() !== 'authorization' && key.toLowerCase() !== 'content-type') {
                 headers[key] = value;
             }
         }
    }

    this.logger.debug(`Using HTTP-Referer: ${headers['HTTP-Referer']}`);
    this.logger.debug(`Using X-Title: ${headers['X-Title']}`);
    return headers;
  }

  private _initializeSecurityManager(config: OpenRouterConfig): SecurityManager | null {
    if (config.security) {
      const manager = new SecurityManager(config.security, this.debug);
      this.logger.log('SecurityManager initialized.');
      if (this.debug) {
        const secureConfigLog = manager.getConfig();
        if (secureConfigLog.userAuthentication?.jwtSecret) {
             secureConfigLog.userAuthentication = { ...secureConfigLog.userAuthentication, jwtSecret: '***REDACTED***' };
        }
        this.logger.debug('Effective Security settings:', secureConfigLog);
      }
      return manager;
    } else {
      this.logger.log('SecurityManager not used (security configuration missing).');
      return null;
    }
  }

  private _initializeAxiosInstance(config: OpenRouterConfig): AxiosInstance {
    const baseAxiosConfig: AxiosRequestConfig = {
        baseURL: this.apiEndpoint,
        timeout: this.axiosConfig?.timeout ?? DEFAULT_TIMEOUT,
        headers: this.headers,
    };

    const mergedConfig: AxiosRequestConfig = {
        ...baseAxiosConfig,
        ...this.axiosConfig,
        headers: {
            ...baseAxiosConfig.headers,
            ...(this.axiosConfig?.headers || {}),
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
        } as any,
    };

    const axiosInstance = axios.create(mergedConfig);
    this.logger.debug('Axios instance created with config:', {
        ...mergedConfig,
        headers: {
             ...mergedConfig.headers,
             Authorization: mergedConfig.headers?.Authorization ? 'Bearer ***REDACTED***' : undefined
        }
    });

    this._setupAxiosInterceptors(axiosInstance);
    return axiosInstance;
  }

  private _setupAxiosInterceptors(instance: AxiosInstance): void {
    instance.interceptors.request.use(config => {
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
             ? { model: (config.data as any).model, messagesCount: (config.data as any).messages?.length, toolsCount: (config.data as any).tools?.length, otherKeys: Object.keys(config.data).filter(k => !['model', 'messages', 'tools'].includes(k)) }
             : typeof config.data;

         let fullUrl = config.url || '';
         if (config.baseURL && config.url) {
             fullUrl = `${config.baseURL.replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`;
         } else if (config.baseURL && !config.url) {
             fullUrl = config.baseURL;
         }

         this.logger.debug('Axios Request ->', {
           method: config.method?.toUpperCase(),
           url: fullUrl,
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

     instance.interceptors.response.use(response => {
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
  }

  private _initializeCostTracker(config: OpenRouterConfig): CostTracker | null {
    if (config.enableCostTracking) {
        this.logger.log('Cost tracking enabled. Initializing CostTracker...');
        const tracker = new CostTracker(this.axiosInstance, this.logger, {
            enableCostTracking: true,
            priceRefreshIntervalMs: config.priceRefreshIntervalMs,
            initialModelPrices: config.initialModelPrices,
            apiBaseUrl: this.apiBaseUrl
        });
        return tracker;
    } else {
        this.logger.log('Cost tracking disabled.');
        return null;
    }
  }

  // --- Core Chat Logic ---

  async chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult> {
    const ctx: MiddlewareContext = {
      request: { options },
      metadata: {}
    };

    await this._runMiddlewares(ctx, async () => {
      try {
        const result = await this._chatInternal(ctx.request.options);
        ctx.response = { ...(ctx.response || {}), result };
      } catch (err) {
        ctx.response = { ...(ctx.response || {}), error: mapError(err) };
      }
    });

    if (ctx.response?.error) throw ctx.response.error;
    if (ctx.response?.result) return ctx.response.result;

    this.logger.error("Middleware chain completed but no result or error was produced.");
    throw new OpenRouterError('Chat middleware chain did not produce a result or error', ErrorCode.UNKNOWN_ERROR);
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

    // Validate specific request options
    if (options.provider) {
        validateProviderRoutingConfig(options.provider, 'options.provider');
    }
    if (options.reasoning) {
        validateReasoningConfig(options.reasoning, 'options.reasoning');
    }
    if (options.models && (!Array.isArray(options.models) || !options.models.every(m => typeof m === 'string'))) {
        throw new ConfigError("'models' option must be an array of strings if provided.");
    }
     if (options.plugins && (!Array.isArray(options.plugins) || !options.plugins.every(p => typeof p === 'object' && p !== null && typeof p.id === 'string'))) {
         throw new ConfigError("'plugins' option must be an array of objects with an 'id' string property if provided.");
     }

    const strictJsonParsing = options.strictJsonParsing ?? this.strictJsonParsing;
    let modelToUse = options.model || this.model;
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
       toolChoice = null, // User's explicit choice
       parallelToolCalls = undefined,
       route = undefined,
       transforms = undefined,
       provider = this.defaultProviderRouting,
       models = undefined,
       plugins = undefined,
       reasoning = undefined,
     } = options;

     // --- Handle :online suffix for Web Search Plugin ---
     let finalPlugins = plugins;
     if (modelToUse.endsWith(':online')) {
         modelToUse = modelToUse.replace(/:online$/, '');
         this.logger.debug(`':online' suffix detected. Ensuring 'web' plugin is included.`);
         const webPluginConfig: PluginConfig = { id: 'web' };
         if (!finalPlugins) {
             finalPlugins = [webPluginConfig];
         } else if (!finalPlugins.some(p => p.id === 'web')) {
             finalPlugins.push(webPluginConfig);
         }
     }

     // --- Authentication ---
     let userInfo: UserAuthInfo | null = null;
     if (this.securityManager) {
         const secConfig = this.securityManager.getConfig();
         if (accessToken) {
             try {
                 userInfo = await this.securityManager.authenticateUser(accessToken);
                 if (userInfo) {
                     this.logger.log(`User authenticated: userId=${userInfo.userId}`);
                 } else {
                     if (secConfig.requireAuthentication) {
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
         } else if (secConfig.requireAuthentication) {
             this.logger.warn('Authentication required (requireAuthentication=true), but accessToken not provided.');
             throw new AuthorizationError('Access token (accessToken) is required for this operation.', 401);
         } else {
              this.logger.debug('accessToken not provided, authentication not required. Request will proceed as anonymous.');
         }
     } else if (accessToken) {
          this.logger.warn('accessToken provided, but SecurityManager not configured. Token will be ignored.');
     }

    // --- Main Execution ---
    let conversationHistory: Message[] = [];
    let messagesForApi: Message[] = [];
    let initialHistoryLength = 0;

    try {
        // 1. Load initial history
        if (user && !customMessages) {
            const historyKey = this._getHistoryKey(user, group);
            try {
                conversationHistory = await this.unifiedHistoryManager.getHistory(historyKey);
                this.logger.debug(`Loaded ${conversationHistory.length} messages from history for key '${historyKey}'.`);
            } catch (histError) {
                 const mappedError = mapError(histError);
                this.logger.error(`Error loading history for key '${historyKey}':`, mappedError.message, mappedError.details);
                conversationHistory = [];
            }
        }
        initialHistoryLength = conversationHistory.length;

        // 2. Prepare messages
        messagesForApi = await this._prepareMessages({
            user, group, prompt, systemPrompt, customMessages,
            _loadedHistory: conversationHistory
        });

        // 3. Build request body
        const initialRequestBody = this._buildRequestBody({
            model: modelToUse,
            messages: messagesForApi,
            tools: tools?.map(ToolHandler.formatToolForAPI) || null,
            responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed,
            toolChoice: toolChoice, // Pass user's explicit choice
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined,
            route, transforms, provider, models, plugins: finalPlugins, reasoning
        });

        // 4. Send request
        const initialResponse = await this._sendRequest(initialRequestBody, 0);

        // 5. Handle response
        const recursiveRequestOptions: Partial<OpenRouterRequestOptions> & { model: string } = {
            model: modelToUse,
            temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
            stop, logitBias, seed, route, transforms, responseFormat, provider, models, plugins: finalPlugins, reasoning,
            parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined
            // Do NOT pass toolChoice down automatically here, let the next _buildRequestBody handle it
        };
        const handleResult = await this._handleApiResponse({
            response: initialResponse,
            currentMessages: messagesForApi,
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
        if (user) {
            const historyKey = this._getHistoryKey(user, group);
            const messagesToSave = messagesForApi.slice(initialHistoryLength);
            if (messagesToSave.length > 0) {
                try {
                     await this.unifiedHistoryManager.addMessages(historyKey, messagesToSave);
                     this.logger.debug(`Saved conversation turn (${messagesToSave.length} messages) to history for key '${historyKey}'.`);
                } catch (histError) {
                    const mappedError = mapError(histError);
                    this.logger.error(`Error saving history for key '${historyKey}':`, mappedError.message, mappedError.details);
                }
            } else {
                this.logger.debug(`No new messages to save for history key '${historyKey}'.`);
            }
        }

        const duration = Date.now() - startTime;
        this.logger.log(`Chat request (${logIdentifier}) completed fully in ${duration} ms.`);

        const finalResult: ChatCompletionResult = {
            content: handleResult.content,
            usage: handleResult.usage,
            model: handleResult.model,
            toolCallsCount: handleResult.toolCallsCount,
            finishReason: handleResult.finishReason,
            durationMs: duration,
            id: handleResult.id,
            cost: handleResult.cost,
            reasoning: handleResult.reasoning,
            annotations: handleResult.annotations,
        };
        return finalResult;

    } catch (error) {
       const mappedError = mapError(error);
       this.logger.error(`Error in chat execution flow: ${mappedError.message}`, mappedError.details || mappedError);
       this._handleError(mappedError);

       if (user && messagesForApi.length > initialHistoryLength) {
           const historyKey = this._getHistoryKey(user, group);
           const messagesToSaveOnError = messagesForApi.slice(initialHistoryLength);
           if (messagesToSaveOnError.length > 0) {
               this.unifiedHistoryManager.addMessages(historyKey, messagesToSaveOnError)
                    .then(() => this.logger.debug(`Saved partial history on error for key '${historyKey}'.`))
                    .catch(histErr => this.logger.error(`Failed to save partial history on error for key ${historyKey}:`, histErr));
           }
       }
       throw mappedError;
    }
  }

   private async _prepareMessages(params: {
     user?: string; group?: string | null; prompt: string; systemPrompt?: string | null; customMessages?: Message[] | null;
     _loadedHistory?: Message[];
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
         if (!_loadedHistory || _loadedHistory.length === 0) {
             throw new ConfigError("'prompt' must be provided if 'customMessages' is not used and history is empty");
         } else {
              this.logger.warn("Neither 'prompt' nor 'systemPrompt' provided, proceeding with history only.");
         }
     }

     let messages: Message[] = [];

     if (_loadedHistory) {
         this.logger.debug(`Using pre-loaded history (${_loadedHistory.length} messages). Filtering...`);
         const filteredHistory = this._filterHistoryForApi(_loadedHistory);
         messages = [...messages, ...filteredHistory];
         this.logger.debug(`Added ${filteredHistory.length} filtered messages from pre-loaded history.`);
     }
     else if (user) {
       const historyKey = this._getHistoryKey(user, group);
       this.logger.warn(`_prepareMessages loading history for key '${historyKey}' (ideally should be pre-loaded by chat()).`);
       try {
           const history = await this.unifiedHistoryManager.getHistory(historyKey);
           if (history.length > 0) {
               this.logger.debug(`History loaded for key '${historyKey}', records: ${history.length}. Filtering...`);
               const filteredHistory = this._filterHistoryForApi(history);
               messages = [...messages, ...filteredHistory];
               this.logger.debug(`Added ${filteredHistory.length} filtered messages from history.`);
           } else {
                this.logger.debug(`History for key '${historyKey}' empty or not found.`);
           }
       } catch (histError) {
           const mappedError = mapError(histError);
           this.logger.error(`Error loading history for key '${historyKey}':`, mappedError.message, mappedError.details);
       }
     } else {
         this.logger.debug('User not specified, history not loaded.');
     }

     if (systemPrompt && !messages.some(m => m.role === 'system')) {
         messages.unshift({ role: 'system', content: systemPrompt });
     }

     if (prompt) {
         messages.push({ role: 'user', content: prompt });
     }

     this.logger.debug(`${messages.length} messages prepared for API request.`);
     return messages.map(m => ({ ...m, content: m.content ?? null }));
   }

   private _filterHistoryForApi(messages: Message[]): Message[] {
       return messages.map(msg => {
           const filteredMsg: Partial<Message> = { role: msg.role };
           if (msg.content !== null && msg.content !== undefined) {
               filteredMsg.content = msg.content;
           } else {
               filteredMsg.content = null;
           }
           if (msg.tool_calls) {
               filteredMsg.tool_calls = msg.tool_calls;
           }
           if (msg.tool_call_id) {
               filteredMsg.tool_call_id = msg.tool_call_id;
           }
           if (msg.name) {
               filteredMsg.name = msg.name;
           }
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
    toolChoice?: OpenRouterRequestOptions['toolChoice'] | null; // User's explicit choice
    parallelToolCalls?: boolean;
    route?: string;
    transforms?: string[];
    provider?: ProviderRoutingConfig;
    models?: string[];
    plugins?: PluginConfig[];
    reasoning?: ReasoningConfig;
  }): Record<string, any> {
    const {
        model,
        messages, tools,
        responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
        stop, logitBias, seed,
        toolChoice, // User's explicit choice from options
        parallelToolCalls, route, transforms,
        provider, models, plugins, reasoning
    } = params;

    const apiMessages = this._filterHistoryForApi(messages);

    const body: Record<string, any> = {
      ...(models && models.length > 0 ? { models: models } : { model: model }),
      messages: apiMessages,
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
             this.logger.debug(`Using explicitly provided tool_choice: ${JSON.stringify(toolChoice)}`);
         } else {
             body.tool_choice = 'auto';
             this.logger.debug(`Tools provided but tool_choice not specified, defaulting to 'auto'.`);
         }
        body.parallel_tool_calls = parallelToolCalls ?? true;
    } else {
         if (toolChoice === 'none') {
             body.tool_choice = 'none';
             this.logger.debug(`No tools provided, but using explicitly provided tool_choice: 'none'`);
         }
    }
    // --- End Tool Configuration ---


    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
           body.response_format = { type: 'json_object' };
           this.logger.debug('Requested response format: json_object');
      } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema?.schema && responseFormat.json_schema?.name) {
          const schemaPayload: any = {
              name: responseFormat.json_schema.name,
              schema: responseFormat.json_schema.schema,
          };
          if (responseFormat.json_schema.strict !== undefined) {
              schemaPayload.strict = responseFormat.json_schema.strict;
              this.logger.debug(`JSON Schema strict mode: ${responseFormat.json_schema.strict}`);
          }
          if (responseFormat.json_schema.description) {
              schemaPayload.description = responseFormat.json_schema.description;
          }
          body.response_format = { type: 'json_schema', json_schema: schemaPayload };
          this.logger.debug(`Requested response format: json_schema (name: ${responseFormat.json_schema.name})`);
      } else if (responseFormat.type === 'json_schema') {
          this.logger.warn('Invalid responseFormat for json_schema: missing `json_schema` object with `name` and `schema`. Ignored.', responseFormat);
      } else {
           if (responseFormat.type) {
               this.logger.warn('Unknown responseFormat type. Ignored.', responseFormat);
           }
      }
    }

    if (route) body.route = route;
    if (transforms && transforms.length > 0) body.transforms = transforms;
    if (provider) body.provider = provider;
    if (plugins && plugins.length > 0) body.plugins = plugins;
    if (reasoning) body.reasoning = reasoning;

    // Handle model fallbacks only if request-level 'models' array wasn't provided
    if (!models && this.modelFallbacks.length > 0) {
        body.models = [model, ...this.modelFallbacks];
        delete body.model; // Remove single model if models array is used
        this.logger.debug(`Using model list (primary + config fallbacks): ${body.models.join(', ')}`);
    } else if (models && models.length > 0) {
        this.logger.debug(`Using model list from request options: ${models.join(', ')}`);
    }

    return body;
  }


   private async _sendRequest(requestBody: Record<string, any>, depth: number): Promise<AxiosResponse<OpenRouterResponse>> {
      this.logger.debug(`(Depth ${depth}) Sending request to API... Model(s): ${requestBody.models ? requestBody.models.join(', ') : requestBody.model}`);

      if (this.debug) {
          try {
              const messagesSummary = requestBody.messages?.map((m: Message) => ({
                  role: m.role,
                  hasContent: m.content !== null && m.content !== undefined,
                  toolCalls: m.tool_calls?.length,
                  toolCallId: m.tool_call_id,
                  name: m.name
              })) || [];
              const toolsSummary = requestBody.tools?.map((t: Tool) => ({ type: t.type, name: t.function?.name })) || [];
              const otherKeys = Object.keys(requestBody).filter(k => !['messages', 'tools'].includes(k));
              const otherData = otherKeys.reduce((acc, key) => {
                  if (requestBody[key] !== undefined) {
                      (acc as any)[key] = requestBody[key];
                  }
                  return acc;
              }, {} as Record<string, any>);

              if (otherData.provider && typeof otherData.provider === 'object') {
                  // Add redaction logic if provider config contains sensitive keys
              }

              this.logger.debug(`(Depth ${depth}) Request Body Details:`, {
                  ...otherData,
                  messagesCount: messagesSummary.length,
                  toolsCount: toolsSummary.length,
              });

          } catch (e) {
              this.logger.error(`(Depth ${depth}) Failed to summarize requestBody for detailed logging:`, e);
              this.logger.debug(`(Depth ${depth}) Request Body (simple):`, { model: requestBody.model, models: requestBody.models, messagesCount: requestBody.messages?.length, toolsCount: requestBody.tools?.length });
          }
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

   private async _handleApiResponse(params: {
       response: AxiosResponse<OpenRouterResponse>;
       currentMessages: Message[];
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
       const responseModel = responseData?.model || requestOptions.model;
       this.logger.debug(`(Depth ${depth}) Handling API response. Status: ${response.status}, Model: ${responseModel}`);

       let currentCumulativeUsage = sumUsage(cumulativeUsage, responseData?.usage);
       if (responseData?.usage) this.logger.log(`(Depth ${depth}) Usage (this step):`, responseData.usage);
       this.logger.debug(`(Depth ${depth}) Cumulative Usage:`, currentCumulativeUsage);

       this.logger.debug(`(Depth ${depth}) API response data summary:`, { id: responseData?.id, model: responseModel, choicesCount: responseData?.choices?.length, usage: responseData?.usage, error: responseData?.error });

       if (responseData?.error) {
           const apiErrorData = responseData.error as any;
           const message = apiErrorData.message || `Unknown API error at depth ${depth}`;
           const code = apiErrorData.code || ErrorCode.API_ERROR;
           // Use response status primarily, fall back to error body status if needed
           const statusCode = response.status || (typeof apiErrorData.status === 'number' ? apiErrorData.status : 500);
           this.logger.error(`(Depth ${depth}) API returned error in body:`, responseData.error);
           // Map based on effective status code
           if (statusCode === 401) throw new AuthenticationError(message, statusCode, apiErrorData);
           if (statusCode === 403) throw new AccessDeniedError(message, statusCode, apiErrorData);
           if (statusCode === 429) throw new RateLimitError(message, statusCode, apiErrorData);
           // Use APIError for other codes, including 400 from the provider
           throw new APIError(message, statusCode, { code, details: apiErrorData, depth });
       }

       if (!responseData?.choices?.length) {
           this.logger.warn(`(Depth ${depth}) API response missing or empty "choices" array.`, responseData);
           throw new APIError(`API response at depth ${depth} lacks valid "choices"`, response.status || 500, responseData);
       }

       const choice = responseData.choices[0];
       const assistantMessageFromAPI = choice.message;

       if (!assistantMessageFromAPI) {
            this.logger.warn(`(Depth ${depth}) No message found in API response choice[0].`);
             throw new APIError(`API response choice at depth ${depth} missing 'message' field`, response.status || 500, responseData);
       }

       const assistantMessageWithTimestamp: Message = {
           ...assistantMessageFromAPI,
           timestamp: formatDateTime(),
           reasoning: assistantMessageFromAPI.reasoning ?? null,
           annotations: assistantMessageFromAPI.annotations ?? [],
        };
       currentMessages.push(assistantMessageWithTimestamp);
       this.logger.debug(`(Depth ${depth}) Added assistant message (role: ${assistantMessageFromAPI.role}) to current conversation.`);


       const finishReason = choice.finish_reason;
       let currentToolCallsCount = cumulativeToolCalls;

       if (finishReason === 'tool_calls' && assistantMessageFromAPI.tool_calls?.length) {
           if (!tools || tools.length === 0) {
               this.logger.error(`(Depth ${depth}) API requested tool calls, but no tools were provided in the request options.`);
               throw new ToolError(`API requested tool calls for model ${responseModel}, but no tools were configured for this request.`);
           }

           const numberOfCalls = assistantMessageFromAPI.tool_calls.length;
           currentToolCallsCount += numberOfCalls;
           this.logger.log(`(Depth ${depth}) Tool calls requested by model (${numberOfCalls}). Total calls so far: ${currentToolCallsCount}. Processing...`);

           if (depth >= maxToolCalls) {
               this.logger.warn(`(Depth ${depth}) Maximum tool call depth (${maxToolCalls}) reached. Aborting tool execution loop.`);
               throw new ToolError(`Maximum tool call depth (${maxToolCalls}) exceeded. Aborting tool execution loop.`, { depth, maxToolCalls });
           }

           let toolResultsMessages: Message[] = [];
           try {
               toolResultsMessages = await ToolHandler.handleToolCalls({
                   message: assistantMessageWithTimestamp as Message & { tool_calls: ToolCall[] },
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

           const toolResultsWithTimestamps = toolResultsMessages.map(msg => ({
               ...msg,
               timestamp: msg.timestamp || formatDateTime()
           }));
           toolResultsWithTimestamps.forEach(msg => currentMessages.push(msg));
           this.logger.debug(`(Depth ${depth}) Added ${toolResultsMessages.length} tool result messages to current conversation.`);

           this.logger.log(`(Depth ${depth}) Sending tool results back to LLM...`);
           const nextRequestBody = this._buildRequestBody({
               ...requestOptions,
               model: responseModel,
               messages: currentMessages,
               tools: tools?.map(ToolHandler.formatToolForAPI) || null,
               // Explicitly set toolChoice to 'auto' for the next step after receiving tool results
               toolChoice: 'auto',
           });

           const nextResponse = await this._sendRequest(nextRequestBody, depth + 1);

           return await this._handleApiResponse({
                ...params,
                response: nextResponse,
                currentMessages: currentMessages,
                depth: depth + 1,
                cumulativeUsage: currentCumulativeUsage,
                cumulativeToolCalls: currentToolCallsCount
           });

       } else {
           this.logger.log(`(Depth ${depth}) Received final response. Finish Reason: ${finishReason}`);
           const rawContent = assistantMessageFromAPI.content;
           let finalResultContent: any = null;

           if (rawContent !== null && rawContent !== undefined) {
               const requestedFormat = requestOptions.responseFormat;
               if ((requestedFormat?.type === 'json_object' || requestedFormat?.type === 'json_schema') && typeof rawContent === 'string') {
                   this.logger.debug(`(Depth ${depth}) Final response: JSON format requested, attempting parse/validation...`);
                   finalResultContent = this._parseAndValidateJsonResponse(rawContent, requestedFormat, strictJsonParsing);
               } else if (requestedFormat && typeof rawContent !== 'string') {
                   this.logger.warn(`(Depth ${depth}) Final response: JSON format requested, but content was not a string (type: ${typeof rawContent}). Raw content:`, rawContent);
                   if (strictJsonParsing) {
                       throw new ValidationError(`Expected a JSON string response for format ${requestedFormat.type}, but received type ${typeof rawContent}.`);
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

           this.logger.debug(`(Depth ${depth}) Final processed result content:`, finalResultContent);

           const cost = this.costTracker?.calculateCost(responseModel, currentCumulativeUsage) ?? null;

           const finalAssistantMessage = currentMessages[currentMessages.length - 1];
           const reasoning = finalAssistantMessage?.reasoning ?? null;
           const annotations = finalAssistantMessage?.annotations ?? [];


           return {
               content: finalResultContent,
               usage: currentCumulativeUsage,
               model: responseModel,
               toolCallsCount: currentToolCallsCount,
               finishReason: finishReason,
               id: responseData.id,
               cost: cost,
               reasoning: reasoning,
               annotations: annotations,
           };
       }
   }


  // --- Error Handling ---
  private _handleError(error: OpenRouterError): void {
    const finalError = mapError(error);
    this.clientEventEmitter.emit('error', finalError);
  }

  // --- History Key Generation ---
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

  // --- Public API Methods ---

  public getHistoryManager(): UnifiedHistoryManager {
    return this.unifiedHistoryManager;
  }

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
        return this.securityManager.createAccessToken(userInfo as Omit<import('./security/types').ExtendedUserAuthInfo, 'expiresAt'>, expiresIn);
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
          const response = await this.axiosInstance.get(creditsUrl, { baseURL: '' });

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


  // --- Event Handling ---
  public on(event: 'error', handler: (error: OpenRouterError) => void): this;
  public on(event: string, handler: (event: any) => void): this;
  public on(event: string, handler: (event: any) => void): this {
    if (event === 'error') {
        this.clientEventEmitter.on(event, handler as (error: OpenRouterError) => void);
        this.logger.debug(`Added client event handler for: ${event}`);
    } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:') || event.startsWith('config:') || event.startsWith('cache:') || event.startsWith('auth:') )) {
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
       } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:') || event.startsWith('config:') || event.startsWith('cache:') || event.startsWith('auth:') )) {
           this.logger.debug(`Removing security event handler for: ${event}`);
           this.securityManager.off(event, handler);
       } else {
            this.logger.warn(`Cannot remove handler for unknown or non-security event '${event}'.`);
       }
       return this;
   }

   public async destroy(): Promise<void> {
       this.logger.log('Destroying OpenRouterClient...');
       if (this.unifiedHistoryManager?.destroy) {
           await this.unifiedHistoryManager.destroy();
           this.logger.debug('UnifiedHistoryManager destroyed.');
       }
       if (this.securityManager?.destroy) {
           this.securityManager.destroy();
           this.logger.debug('SecurityManager destroyed.');
       }
       if (this.costTracker?.destroy) {
           this.costTracker.destroy();
           this.logger.debug('CostTracker destroyed.');
       }
       this.clientEventEmitter.removeAllListeners();
       this.logger.debug('Client event listeners removed.');

       this.plugins = [];
       this.middlewares = [];

       this.logger.log('OpenRouterClient successfully destroyed.');
   }

  /** @deprecated Tool processing is now integrated into client.chat(). Use the main chat method instead. */
  public async handleToolCalls(params: {
    message: Message & { tool_calls?: ToolCall[] };
    messages: Message[];
    tools?: Tool[];
    debug?: boolean;
    accessToken?: string;
  }): Promise<Message[]> {
     this.logger.warn("Method client.handleToolCalls() is deprecated and will be removed. Tool processing is integrated into client.chat().");

     if (!params.message?.tool_calls?.length) {
          this.logger.warn("[handleToolCalls Deprecated] Called without tool_calls in message. Returning empty array.");
          return [];
     }
     if (!params.tools || params.tools.length === 0) {
         this.logger.warn("[handleToolCalls Deprecated] Called without tools defined. Tool execution cannot proceed.");
         throw new ToolError("Tool processing failed: No tools were defined to handle the request.");
     }

     let userInfo: UserAuthInfo | null = null;
     let secConfig: BaseSecurityConfig | undefined;

     if (this.securityManager) {
         const currentSecConfig = this.securityManager.getConfig();
         secConfig = currentSecConfig as BaseSecurityConfig;

         if (params.accessToken) {
             try {
                 userInfo = await this.securityManager.authenticateUser(params.accessToken);
                 if (!userInfo && secConfig?.requireAuthentication) {
                      throw new AuthenticationError("Authentication required but failed for handleToolCalls (Deprecated).", 401);
                 }
             } catch (error) {
                 const mappedError = mapError(error);
                 this.logger.error('[handleToolCalls Deprecated] Authentication error:', mappedError.message);
                 throw mappedError;
             }
         } else if (secConfig?.requireAuthentication && !(currentSecConfig as any).allowUnauthenticatedAccess) {
              throw new AuthorizationError("Authentication required but accessToken not provided for handleToolCalls (Deprecated).", 401);
         }
     }

     try {
        const toolResultsMessages = await ToolHandler.handleToolCalls({
           message: params.message as Message & { tool_calls: ToolCall[] },
           debug: this.debug,
           tools: params.tools ?? [],
           securityManager: this.securityManager || undefined,
           userInfo: userInfo,
           logger: this.logger.withPrefix('ToolHandler(Deprecated)'),
           parallelCalls: true,
         });
         return toolResultsMessages;
     } catch (error) {
          const mappedError = mapError(error);
          this.logger.error(`[handleToolCalls Deprecated] Error during tool processing: ${mappedError.message}`, mappedError.details);
          throw mappedError;
     }
  }

  // --- Plugin and Middleware Management ---

  public async use(plugin: OpenRouterPlugin): Promise<void> {
    if (!plugin || typeof plugin.init !== 'function') {
      throw new ConfigError('Invalid plugin: missing init() method or plugin is not an object');
    }
    try {
        await plugin.init(this);
        this.plugins.push(plugin);
        this.logger.log(`Plugin registered: ${plugin.constructor?.name || 'anonymous plugin'}`);
    } catch (error) {
        const mappedError = mapError(error);
        this.logger.error(`Error initializing plugin ${plugin.constructor?.name || 'anonymous plugin'}: ${mappedError.message}`, mappedError.details);
        throw mappedError;
    }
  }

  public useMiddleware(fn: MiddlewareFunction): void {
    if (typeof fn !== 'function') {
      throw new ConfigError('Middleware must be a function');
    }
    this.middlewares.push(fn);
    this.logger.log(`Middleware registered: ${fn.name || 'anonymous'}`);
  }

  private async _runMiddlewares(ctx: MiddlewareContext, coreFn: () => Promise<void>): Promise<void> {
    const stack = this.middlewares.slice();

    const dispatch = async (i: number): Promise<void> => {
      if (i < stack.length) {
        const middleware = stack[i];
        await middleware(ctx, () => dispatch(i + 1));
      } else {
        await coreFn();
      }
    };
    await dispatch(0);
  }

  /** @internal */
  public setSecurityManager(securityManager: SecurityManager | null): void {
    if (this.securityManager?.destroy) {
        this.securityManager.destroy();
    }
    this.securityManager = securityManager;
    this.logger.log(`SecurityManager instance ${securityManager ? 'replaced' : 'removed'} via plugin/method call.`);
    this.securityManager?.setDebugMode(this.debug);
  }

  /** @internal */
  public setCostTracker(costTracker: CostTracker | null): void {
    this.costTracker?.destroy();
    this.costTracker = costTracker;
    this.logger.log(`CostTracker instance ${costTracker ? 'replaced' : 'removed'} via plugin/method call.`);
  }

} 