// Path: client.ts
/**
 * Main client for interacting with OpenRouter API.
 * Provides methods for sending chat requests, managing history,
 * calling tools, and configuring security.
 *
 * @example
 * import { OpenRouterClient } from 'openrouter-kit'; // or your path
 *
 * const client = new OpenRouterClient({
 *   apiKey: 'YOUR_OPENROUTER_API_KEY',
 *   // Optionally override default referer/title:
 *   // referer: 'https://my-amazing-app.com',
 *   // title: 'My Amazing App'
 * });
 *
 * async function main() {
 *   try {
 *     const response = await client.chat({ prompt: 'Hello, world!' });
 *     console.log('Model response:', response);
 *   } catch (error) {
 *     console.error('Error:', error);
 *   }
 * }
 *
 * main();
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
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
} from './types';
import { HistoryManager } from './history-manager';
import { ToolHandler } from './tool-handler';
import { formatMessages, formatResponseForDisplay } from './utils/formatting';
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
    NetworkError
} from './utils/error';
import * as jsonUtils from './utils/json-utils';
// import { validateJsonSchema } from './utils/json-utils';
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

const DEFAULT_REFERER_URL = "https://github.com/mmeerrkkaa/openrouter-kit";
const DEFAULT_X_TITLE = "openrouter-kit";

export class OpenRouterClient {
  private apiKey: string;
  private apiEndpoint: string;
  private model: string;
  private debug: boolean;
  // Define the type for the proxy object where port is always a number internally
  private proxy: string | { host: string; port: number; user?: string; pass?: string } | null;
  private headers: Record<string, string>;
  private historyManager: HistoryManager;
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

  /**
   * Creates an OpenRouter Kit instance.
   *
   * @param config - Client configuration.
   * @param config.apiKey - Your OpenRouter API key (required).
   * @param config.apiEndpoint - OpenRouter API URL. Default is the official endpoint.
   * @param config.model - Default model for requests.
   * @param config.debug - Enable verbose logging mode.
   * @param config.proxy - Proxy settings (URL string or object { host, port: number | string, user?, pass? }).
   * @param config.referer - HTTP-Referer header. Overrides the default value.
   * @param config.title - X-Title header. Overrides the default value.
   * @param config.historyStorage - History storage type ('memory' or 'disk').
   * @param config.historyAutoSave - Auto-save history for 'disk'.
   * @param config.historyTtl - TTL for history entries (ms).
   * @param config.historyCleanupInterval - History cleanup interval (ms).
   * @param config.providerPreferences - OpenRouter provider preferences settings.
   * @param config.modelFallbacks - List of fallback models.
   * @param config.responseFormat - Default response format.
   * @param config.security - Security configuration object.
   * @param config.strictJsonParsing - Strict JSON validation in responses. Default is false.
   * @param config.axiosConfig - Additional Axios settings to merge.
   *
   * @throws {ConfigError} If configuration is invalid.
   */
  constructor(config: OpenRouterConfig) {
    // Validate configuration before use (validation handles port string check)
    validateConfig(config);

    this.debug = config.debug ?? false;
    this.logger = new Logger({ debug: this.debug, prefix: 'OpenRouterClient' });
    jsonUtils.setJsonUtilsLogger(this.logger.withPrefix('JsonUtils'));
    this.clientEventEmitter = new SimpleEventEmitter();

    this.logger.log('Initializing OpenRouter Kit...');

    this.apiKey = config.apiKey;
    this.apiEndpoint = config.apiEndpoint || API_ENDPOINT;
    this.model = config.model || DEFAULT_MODEL;
    this.axiosConfig = config.axiosConfig;

    // Process and assign proxy, converting port to number if needed
    let processedProxy: typeof this.proxy = null; // Initialize with the target type
    if (config.proxy) {
        if (typeof config.proxy === 'string') {
            processedProxy = config.proxy;
        } else if (typeof config.proxy === 'object' && config.proxy !== null) {
            let portNumber: number;
            if (typeof config.proxy.port === 'string') {
                portNumber = parseInt(config.proxy.port, 10);
                // Validation should have caught non-numeric strings, but double-check
                if (isNaN(portNumber)) {
                    this.logger.error(`Internal validation inconsistency: Proxy port string '${config.proxy.port}' failed parsing after validation. Disabling proxy.`);
                    portNumber = 0; // Assign a dummy value, proxy will be set to null below
                }
            } else {
                // It must be a number due to validation
                portNumber = config.proxy.port;
            }

            // Only assign if port is valid (validation checks range 1-65535)
            if (portNumber > 0) {
                processedProxy = {
                    ...config.proxy, // Copy host, user, pass
                    port: portNumber, // Assign the guaranteed number
                };
            } else {
                 // Logged error above, ensure proxy is null
                 processedProxy = null;
            }
        }
    }
    this.proxy = processedProxy; // Assign the processed proxy value

    // Form headers
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'HTTP-Referer': config.referer ?? DEFAULT_REFERER_URL,
      'X-Title': config.title ?? DEFAULT_X_TITLE,
    };
    this.logger.debug(`Using HTTP-Referer: ${this.headers['HTTP-Referer']}`);
    this.logger.debug(`Using X-Title: ${this.headers['X-Title']}`);


    this.strictJsonParsing = config.strictJsonParsing ?? false;

    // HistoryManager setup
    const historyStorage: HistoryStorageType = config.historyStorage || 'memory';
    const chatsFolder = DEFAULT_CHATS_FOLDER;
    const maxHistory = MAX_HISTORY_ENTRIES;

    this.historyManager = new HistoryManager({
      storageType: historyStorage,
      chatsFolder: chatsFolder,
      maxHistoryEntries: maxHistory,
      debug: this.debug,
      ttl: config.historyTtl,
      cleanupInterval: config.historyCleanupInterval,
      autoSaveOnExit: config.historyAutoSave,
    });
    this.logger.log(`History manager initialized: type=${historyStorage}, folder=${chatsFolder}, maxEntries=${maxHistory}`);

    // Other options
    this.providerPreferences = config.providerPreferences || undefined;
    this.modelFallbacks = config.modelFallbacks || [];
    this.enableReasoning = config.enableReasoning || false;
    this.webSearch = config.webSearch || false;
    this.defaultResponseFormat = config.responseFormat || null;

    // Initialize SecurityManager
    if (config.security) {
      this.securityManager = new SecurityManager(config.security, this.debug);
      this.logger.log('SecurityManager initialized.');
      if (this.debug) {
        // Clone security config and redact secret for logging
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

    // Create Axios instance AFTER initializing all fields used in interceptors
    this.axiosInstance = this._createAxiosInstance();

    this.logger.log('OpenRouter Kit successfully initialized.');
  }

  /**
   * Creates and configures an Axios instance for HTTP requests.
   * Applies proxy, headers, and interceptors for logging.
   * Merges standard configuration with `this.axiosConfig`.
   *
   * @returns {AxiosInstance} Configured Axios instance.
   * @private
   */
  private _createAxiosInstance(): AxiosInstance {
    const baseAxiosConfig: AxiosRequestConfig = {
        baseURL: this.apiEndpoint,
        timeout: DEFAULT_TIMEOUT,
        headers: this.headers,
    };

    const mergedConfig: AxiosRequestConfig = {
        ...baseAxiosConfig,
        ...this.axiosConfig,
        headers: {
            ...baseAxiosConfig.headers,
            ...(this.axiosConfig?.headers || {}),
        }
    };

    const axiosInstance = axios.create(mergedConfig);
    this.logger.debug('Axios instance created with config:', mergedConfig);

    axiosInstance.interceptors.request.use(config => {
        if (this.proxy) {
            this.logger.debug('Using proxy:', typeof this.proxy === 'string' ? this.proxy : `${this.proxy.host}:${this.proxy.port}`);
            let proxyUrl: string;
            if (typeof this.proxy === 'object') {
                const auth = this.proxy.user ? `${this.proxy.user}:${this.proxy.pass}@` : '';
                proxyUrl = `http://${auth}${this.proxy.host}:${this.proxy.port}`;
            } else {
                proxyUrl = this.proxy;
            }
            config.httpsAgent = new HttpsProxyAgent(proxyUrl);
            config.proxy = false;
        }

       if (this.debug) {
         const headersToLog = { ...config.headers };
         if (headersToLog?.Authorization) {
             headersToLog.Authorization = 'Bearer ***REDACTED***';
         }
         this.logger.debug('Axios Request ->', {
           method: config.method?.toUpperCase(),
           url: config.url,
           headers: headersToLog,
           data: config.data,
         });
       }
       return config;
    }, error => {
        this.logger.error('Axios Request Error:', error);
        return Promise.reject(error);
    });

     axiosInstance.interceptors.response.use(response => {
       if (this.debug) {
         this.logger.debug('Axios Response <-', {
           status: response.status,
           statusText: response.statusText,
           headers: response.headers,
           data: response.data,
         });
       }
       return response;
     }, error => {
       if (this.debug) {
         this.logger.error('Axios Response Error <-', {
           message: error.message,
           config: error.config ? { url: error.config.url, method: error.config.method } : undefined,
           response: error.response ? {
               status: error.response.status,
               statusText: error.response.statusText,
               headers: error.response.headers,
               data: error.response.data,
           } : undefined,
         });
       }
       return Promise.reject(error);
     });

    return axiosInstance;
  }

  /**
   * Sends a request to the OpenRouter model to get a response in chat.
   * Handles message preparation, request building, API interaction, and response processing.
   *
   * @param options - Request parameters.
   * @returns {Promise<any>} Promise resolving with the model's response (string or parsed object).
   * @throws {OpenRouterError} or its subclasses if an error occurs.
   */
  async chat(options: OpenRouterRequestOptions): Promise<any> {
    const startTime = Date.now();
    if (!options.customMessages && !options.prompt) {
        throw new ConfigError("'prompt' or 'customMessages' must be provided in options");
    }
    const logIdentifier = options.prompt
        ? `prompt: "${options.prompt.substring(0, 50)}..."`
        : `customMessages: ${options.customMessages?.length ?? 0}`;
    this.logger.log(`Starting chat(${logIdentifier})...`);

    const strictJsonParsing = options.strictJsonParsing ?? this.strictJsonParsing;

    const {
      user,
      group = null,
      prompt = '',
      systemPrompt = null,
      tools = null,
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
                         throw new AuthenticationError('Valid access token (accessToken) is required', 401);
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
            throw new AuthorizationError('Access token (accessToken) is required', 401);
        } else {
            this.logger.debug('accessToken not provided, authentication not required. Request will proceed as anonymous.');
        }
    } else if (accessToken) {
         this.logger.warn('accessToken provided, but SecurityManager not configured. Token will be ignored.');
    }

    try {
      const messages = await this._prepareMessages({ user, group, prompt, systemPrompt, customMessages });

      const requestBody = this._buildRequestBody({
          messages,
          tools: tools?.map(ToolHandler.formatToolForAPI) || null,
          responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
          stop, logitBias, seed, toolChoice,
          parallelToolCalls: tools && tools.length > 0 ? (parallelToolCalls ?? true) : undefined,
          route, transforms
      });

      if (options.stream) {
          this.logger.warn('Streaming (stream: true) not yet implemented.');
          return ''; // Temporarily return empty string for streams
      }

      const response = await this._sendRequest(requestBody);

      const result = await this._processResponse({
        response, requestBody, user, group, prompt, startTime,
        tools: tools || undefined,
        userInfo,
        strictJsonParsing
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Chat request (${logIdentifier}) completed in ${duration} ms.`);
      return result;

    } catch (error) {
       const mappedError = mapError(error);
       this.logger.error(`Error in chat method: ${mappedError.message}`, mappedError.details || mappedError);
       this._handleError(mappedError);
       throw mappedError;
    }
  }


  /** @private */
  private async _prepareMessages(params: {
    user?: string; group?: string | null; prompt: string; systemPrompt?: string | null; customMessages?: Message[] | null;
  }): Promise<Message[]> {
    const { user, group, prompt, systemPrompt, customMessages } = params;

    if (customMessages) {
       this.logger.debug(`Using provided customMessages (${customMessages.length} items).`);
        let finalMessages = [...customMessages];
        const hasSystem = finalMessages.some(m => m.role === 'system');
        if (systemPrompt && !hasSystem) {
            this.logger.debug('Adding systemPrompt to customMessages.');
            finalMessages.unshift({ role: 'system', content: systemPrompt });
        }
        return finalMessages;
    }

    if (!prompt && !systemPrompt) {
        throw new ConfigError("'prompt' or 'customMessages' must be provided");
    }

    let messages: Message[] = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }

    if (user) {
      const historyKey = this._getHistoryKey(user, group);
      try {
          const history = await this.historyManager.getHistory(historyKey);
          if (history.length > 0) {
              this.logger.debug(`History loaded for key '${historyKey}', records: ${history.length}.`);
              messages = [...messages, ...formatMessages(history)];
          } else {
               this.logger.debug(`History for key '${historyKey}' empty or not found.`);
          }
      } catch (histError) {
          this.logger.error(`Error loading history for key '${historyKey}':`, histError);
      }
    } else {
        this.logger.debug('User not specified, history not loaded.');
    }

    if (prompt) {
        messages.push({ role: 'user', content: prompt });
    }

    this.logger.debug(`${messages.length} messages prepared for API request.`);
    return messages;
  }

  /** @private */
  private _buildRequestBody(params: {
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
        messages, tools, responseFormat, temperature, maxTokens, topP, presencePenalty, frequencyPenalty,
        stop, logitBias, seed, toolChoice, parallelToolCalls, route, transforms
    } = params;

    const body: Record<string, any> = {
      model: this.model,
      messages: messages,
      ...(temperature !== undefined && { temperature: temperature }),
    };

    if (maxTokens != null && maxTokens > 0) body.max_tokens = maxTokens;
    if (topP != null) body.top_p = topP;
    if (presencePenalty != null) body.presence_penalty = presencePenalty;
    if (frequencyPenalty != null) body.frequency_penalty = frequencyPenalty;
    if (stop != null && stop !== '') body.stop = stop;
    if (logitBias != null && Object.keys(logitBias).length > 0) body.logit_bias = logitBias;
    if (seed != null) body.seed = seed;

    if (tools && tools.length > 0) {
        body.tools = tools.map(t => ({ type: t.type, function: t.function }));
        if (toolChoice != null) body.tool_choice = toolChoice;
        if (parallelToolCalls !== undefined) {
            body.parallel_tool_calls = parallelToolCalls;
        }
    } else {
        if (toolChoice && typeof toolChoice !== 'string' || (typeof toolChoice === 'string' && toolChoice !== 'none')) {
             this.logger.warn(`Parameter 'toolChoice' (${JSON.stringify(toolChoice)}) specified, but no tools provided. Setting toolChoice = 'none'.`);
             body.tool_choice = 'none';
        } else if (toolChoice === 'none') {
             body.tool_choice = 'none';
        }
    }

    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
           body.response_format = { type: 'json_object' };
           this.logger.debug('Requested response format: json_object');
      } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema?.schema) {
          body.response_format = { type: 'json_schema', json_schema: responseFormat.json_schema };
          this.logger.debug(`Requested response format: json_schema (name: ${responseFormat.json_schema.name})`);
      } else {
          this.logger.warn('Invalid responseFormat or missing schema for json_schema. Ignored.', responseFormat);
      }
    }

    if (route) body.route = route;
    if (transforms && transforms.length > 0) body.transforms = transforms;
    if (this.providerPreferences) body.provider = this.providerPreferences;
    if (this.modelFallbacks.length > 0) {
        body.models = [this.model, ...this.modelFallbacks];
        this.logger.debug(`Using fallback models: ${body.models.join(', ')}`);
    }

    return body;
  }

  /** @private */
  private async _sendRequest(requestBody: Record<string, any>): Promise<AxiosResponse<OpenRouterResponse>> {
     this.logger.debug('Sending request to API:', requestBody);
     try {
         return await this.axiosInstance.post<OpenRouterResponse>('', requestBody);
     } catch (axiosError) {
         throw mapError(axiosError);
     }
  }

   /** @private */
   private async _addHistoryEntry(
       user: string | undefined,
       group: string | null | undefined,
       userPrompt: string,
       assistantResponse: any
    ): Promise<void> {
       if (!user) {
           this.logger.debug('User not specified, history entry not added.');
           return;
       }
       if (!userPrompt && (assistantResponse === null || assistantResponse === undefined || assistantResponse === '')) {
            this.logger.debug('Empty prompt and response, history entry not added.');
            return;
        }

       const historyKey = this._getHistoryKey(user, group);
       let assistantContent: string | null = null;
       let assistantToolCalls: ToolCall[] | undefined = undefined;

       if (typeof assistantResponse === 'object' && assistantResponse !== null && assistantResponse.tool_calls) {
           assistantContent = assistantResponse.content ?? null;
           assistantToolCalls = assistantResponse.tool_calls as ToolCall[];
       } else if (assistantResponse !== null && assistantResponse !== undefined) {
            assistantContent = typeof assistantResponse === 'string'
                ? assistantResponse
                : jsonUtils.safeStringify(assistantResponse, '"[Error serializing response]"', { logger: this.logger });
       }

       try {
            const userMessage: Message = { role: 'user', content: userPrompt };
            const assistantMessage: Message = {
                role: 'assistant',
                content: assistantContent,
                ...(assistantToolCalls && { tool_calls: assistantToolCalls })
            };

           await this.historyManager.addEntry(historyKey, userMessage, assistantMessage);
           this.logger.debug(`History entry added for key '${historyKey}'.`);
       } catch (histError) {
           this.logger.error(`Error adding history entry for key '${historyKey}':`, histError);
       }
   }

   /** @private */
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
           } else {
               this.logger.debug(`JSON schema validation not required or schema not provided.`);
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

   /** @private */
   private async _processResponse(params: {
       response: AxiosResponse<OpenRouterResponse>;
       requestBody: Record<string, any>;
       user?: string; group?: string | null; prompt: string; startTime: number;
       tools?: Tool[];
       userInfo?: UserAuthInfo | null;
       strictJsonParsing: boolean;
   }): Promise<any> {
       const { response, requestBody, user, group, prompt, startTime, tools, userInfo, strictJsonParsing } = params;
       const responseData = response.data;
       const duration = Date.now() - startTime;
       this.logger.debug(`API response received in ${duration} ms. Status: ${response.status}`);
       if (responseData?.system_fingerprint) this.logger.debug(`System Fingerprint: ${responseData.system_fingerprint}`);
       if (responseData?.usage) this.logger.log('Usage:', responseData.usage);
       this.logger.debug('API response (data):', responseData);

       if (responseData?.error) {
           const apiErrorData = responseData.error as any;
           const message = apiErrorData.message || 'Unknown API error';
           const code = apiErrorData.code || ErrorCode.API_ERROR;
           const statusCode = apiErrorData.status || response.status || 500;
           throw new APIError(message, statusCode, { code, details: apiErrorData });
       }

       if (!responseData?.choices?.length) {
           throw new APIError('API response does not contain "choices" field or it is empty', response.status, responseData);
       }

       const choice = responseData.choices[0];
       const assistantMessage = choice.message;

       // Find the last user message for history context
       const lastUserMessage = requestBody.messages?.slice().reverse().find((m: Message) => m.role === 'user');
       const promptForHistory = lastUserMessage?.content || prompt || "<prompt not found>";

       // --- Handle tool calls ---
       if (assistantMessage.tool_calls?.length && tools?.length) {
           this.logger.log(`Found ${assistantMessage.tool_calls.length} tool calls. Starting ToolHandler...`);
           // Add the assistant message *requesting* the tool call to history
           await this._addHistoryEntry(user, group, promptForHistory, assistantMessage);

           try {
               const finalResponseAfterTools = await ToolHandler.handleToolCalls({
                   message: assistantMessage as Message & { tool_calls: ToolCall[] },
                   messages: requestBody.messages,
                   client: this,
                   debug: this.debug,
                   tools: tools,
                   securityManager: this.securityManager || undefined,
                   userInfo: userInfo ?? null,
                   logger: this.logger.withPrefix('ToolHandler'),
                   parallelCalls: requestBody.parallel_tool_calls ?? true
               });
               this.logger.log('Tool processing and final response received.');
               // Note: ToolHandler adds tool results and final assistant response to history.
               return finalResponseAfterTools;
           } catch (toolHandlerError) {
                const mappedError = mapError(toolHandlerError);
                this.logger.error(`Error during tool processing in ToolHandler: ${mappedError.message}`, mappedError.details);
                throw mappedError;
           }
       }

       // --- Handle regular response ---
       const rawContent = assistantMessage.content;
       let finalResult: any = ''; // Default to empty string

       if (rawContent !== null && rawContent !== undefined) {
           if (typeof rawContent !== 'string') {
                this.logger.warn(`Expected string content from assistant, received ${typeof rawContent}. Converting to string.`);
                finalResult = String(rawContent);
           } else {
               finalResult = rawContent;
           }

           const requestedFormat = requestBody.response_format as ResponseFormat | undefined;
           if ((requestedFormat?.type === 'json_object' || requestedFormat?.type === 'json_schema') && typeof finalResult === 'string') {
               finalResult = this._parseAndValidateJsonResponse(finalResult, requestedFormat, strictJsonParsing);
           } else if (requestedFormat && typeof finalResult !== 'string') {
               this.logger.warn(`JSON format requested, but content was not a string (${typeof finalResult}). Skipping JSON processing.`);
           }
       } else {
            this.logger.warn(`Received null or undefined content from assistant. Finish reason: ${choice.finish_reason}`);
       }

       // Add the regular response to history
       await this._addHistoryEntry(user, group, promptForHistory, finalResult);

       return finalResult;
   }

  /** @private */
  private _handleError(error: OpenRouterError): void {
    this.clientEventEmitter.emit('error', error);
  }

  /** @private */
  private _getHistoryKey(user: string, group?: string | null): string {
    return group ? `group:${group}_user:${user}` : `user:${user}`;
  }

  // --- Public methods ---

  public getHistoryManager(): HistoryManager { return this.historyManager; }

  public getHistoryStorageType(): HistoryStorageType { return this.historyManager.getStorageType(); }

  public isDebugMode(): boolean { return this.debug; }

  public getSecurityManager(): SecurityManager | null { return this.securityManager; }

  public isSecurityEnabled(): boolean { return this.securityManager !== null; }

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
    if (this.axiosInstance?.defaults?.headers) {
        if (this.axiosInstance.defaults.headers.common) {
             this.axiosInstance.defaults.headers.common['Authorization'] = authHeader;
        } else {
             (this.axiosInstance.defaults.headers as Record<string, any>)['Authorization'] = authHeader;
        }
    }
    this.headers['Authorization'] = authHeader;
    this.logger.log('API key successfully updated.');
  }

  /**
   * Creates JWT access token for user (requires configured SecurityManager with JWT).
   *
   * @param userInfo - User info to include in token (excluding `expiresAt`).
   * @param expiresIn - Token lifetime (e.g., '24h', 3600). Default handled by SecurityManager.
   * @returns {string} Generated JWT token.
   * @throws {ConfigError} If SecurityManager not configured or not supporting JWT.
   * @throws {SecurityError} If token creation error occurred.
   */
  public createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string {
    if (!this.securityManager) {
        throw new ConfigError('Cannot create token: SecurityManager not configured.');
    }
     this.logger.log(`Requesting access token creation for user ${userInfo.userId} (validity: ${expiresIn ?? 'default'})...`);
    return this.securityManager.createAccessToken(userInfo, expiresIn as string);
  }


  public on(event: 'error', handler: (error: OpenRouterError) => void): this;
  public on(event: string, handler: (event: any) => void): this;
  public on(event: string, handler: (event: any) => void): this {
    if (event === 'error') {
        // Explicit cast for the specific 'error' event handler type
        this.clientEventEmitter.on(event, handler as (error: OpenRouterError) => void);
        this.logger.debug(`Added client event handler for: ${event}`);
    } else if (this.securityManager) {
        this.logger.debug(`Adding security event handler for: ${event}`);
        this.securityManager.on(event, handler);
    } else {
      this.logger.warn(`Cannot add handler for event '${event}': SecurityManager not configured.`);
    }
    return this;
  }

   public off(event: 'error', handler: (error: OpenRouterError) => void): this;
   public off(event: string, handler: (event: any) => void): this;
   public off(event: string, handler: (event: any) => void): this {
       if (event === 'error') {
           // Explicit cast for the specific 'error' event handler type
           this.clientEventEmitter.off(event, handler as (error: OpenRouterError) => void);
           this.logger.debug(`Removed client event handler for: ${event}`);
       } else if (this.securityManager) {
           this.logger.debug(`Removing security event handler for: ${event}`);
           this.securityManager.off(event, handler);
       } else {
            this.logger.warn(`Cannot remove handler for event '${event}': SecurityManager not configured.`);
       }
       return this;
   }

   public async destroy(): Promise<void> {
       this.logger.log('Destroying OpenRouterClient...');
       if (this.historyManager) {
           await this.historyManager.destroy();
       }
       if (this.securityManager) {
           this.securityManager.destroy();
       }
       this.clientEventEmitter.removeAllListeners();
       this.logger.log('OpenRouterClient successfully destroyed.');
   }

  /**
   * @deprecated Direct call `handleToolCalls` is deprecated. Tool processing now happens automatically inside `chat`.
   */
  public async handleToolCalls(params: {
    message: Message & { tool_calls?: any[] };
    messages: Message[];
    tools?: Tool[];
    debug?: boolean;
    accessToken?: string;
  }): Promise<string> {
     this.logger.warn("Method client.handleToolCalls() is deprecated and may be removed in future versions. Tool processing is now built into client.chat().");

     if (!params.message?.tool_calls?.length) {
          this.logger.warn("[handleToolCalls] Called without tool_calls in message. Returning empty result.");
          return "";
     }

     let userInfo: UserAuthInfo | null = null;
     if (this.securityManager && params.accessToken) {
         try {
             userInfo = await this.securityManager.authenticateUser(params.accessToken);
         } catch (error) {
             const mappedError = mapError(error);
             this.logger.error('[handleToolCalls] Authentication error:', mappedError);
             throw mappedError;
         }
     }

     try {
         // Ensure ToolHandler.handleToolCalls aligns with expected parameters
         return await ToolHandler.handleToolCalls({
           message: params.message as Message & { tool_calls: ToolCall[] }, // Type assertion after check
           messages: params.messages,
           client: this, // Pass the client instance
           debug: params.debug ?? this.debug, // Use provided debug or client's default
           tools: params.tools ?? [], // Ensure tools is an array
           securityManager: this.securityManager || undefined, // Pass security manager if exists
           userInfo: userInfo, // Pass resolved userInfo
           logger: this.logger.withPrefix('ToolHandler(Deprecated)'),
           parallelCalls: true // Default to parallel for deprecated method
         });
     } catch (error) {
          const mappedError = mapError(error);
          this.logger.error(`[handleToolCalls] Error during tool processing: ${mappedError.message}`);
          throw mappedError;
     }
  }
}