// Path: src/core/api-handler.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosHeaders } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
    OpenRouterConfig,
    OpenRouterResponse,
    Message,
    Tool,
    ResponseFormat,
    ProviderRoutingConfig,
    PluginConfig,
    ReasoningConfig,
    CreditBalance,
    ApiKeyInfo,
    ModelPricingInfo,
    UsageInfo,
    OpenRouterRequestOptions,
} from '../types';
import { Logger } from '../utils/logger';
import { mapError, APIError, ConfigError, TimeoutError, NetworkError } from '../utils/error';
import { ToolHandler } from '../tool-handler';
import {
    API_ENDPOINT,
    DEFAULT_TIMEOUT,
    CREDITS_API_PATH,
    API_KEY_INFO_PATH,
    MODELS_API_PATH,
    DEFAULT_API_BASE_URL,
    DEFAULT_REFERER_URL,
    DEFAULT_X_TITLE
} from '../config';

type ProxyConfig = string | {
    host: string;
    port: number | string;
    user?: string;
    pass?: string;
} | null;

interface ApiHandlerConfig {
    apiKey: string;
    apiEndpoint?: string;
    apiBaseUrl?: string;
    proxy?: ProxyConfig;
    headers?: Record<string, string>;
    axiosConfig?: AxiosRequestConfig;
    modelFallbacks?: string[];
    logger: Logger;
    debug: boolean;
}

export class ApiHandler {
    private apiKey: string;
    private apiEndpoint: string;
    readonly apiBaseUrl: string;
    private proxy: ProxyConfig;
    private baseHeaders: Record<string, string>;
    private axiosInstance: AxiosInstance;
    private modelFallbacks: string[];
    private logger: Logger;
    private debug: boolean;

    constructor(config: ApiHandlerConfig) {
        this.apiKey = config.apiKey;
        this.apiEndpoint = config.apiEndpoint || API_ENDPOINT;
        this.apiBaseUrl = config.apiBaseUrl || DEFAULT_API_BASE_URL;
        this.proxy = this._processProxyConfig(config.proxy, config.logger);
        this.baseHeaders = this._initializeHeaders(config);
        this.modelFallbacks = config.modelFallbacks || [];
        this.logger = config.logger.withPrefix('ApiHandler');
        this.debug = config.debug;

        this.axiosInstance = this._initializeAxiosInstance(config);
        this.logger.log('ApiHandler initialized.');
    }

    public updateApiKey(newApiKey: string): void {
        if (this.apiKey === newApiKey) return;
        this.logger.log('Updating API key for ApiHandler...');
        this.apiKey = newApiKey;
        const authHeader = `Bearer ${this.apiKey}`;
        this.baseHeaders['Authorization'] = authHeader;
        if (this.axiosInstance?.defaults?.headers) {
            if (this.axiosInstance.defaults.headers.common) {
                this.axiosInstance.defaults.headers.common['Authorization'] = authHeader;
            } else {
                (this.axiosInstance.defaults.headers as Record<string, any>)['Authorization'] = authHeader;
            }
        }
        this.logger.log('ApiHandler API key updated.');
    }

    public getAxiosInstance(): AxiosInstance {
        return this.axiosInstance;
    }

    public buildChatRequestBody(params: {
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
        provider?: ProviderRoutingConfig;
        models?: string[];
        plugins?: PluginConfig[];
        reasoning?: ReasoningConfig;
        filterMessagesForApi: (messages: Message[]) => Message[];
    }): Record<string, any> {
        const {
            model, messages, tools, responseFormat, temperature, maxTokens, topP,
            presencePenalty, frequencyPenalty, stop, logitBias, seed, toolChoice,
            parallelToolCalls, route, transforms, provider, models, plugins, reasoning,
            filterMessagesForApi
        } = params;

        const apiMessages = filterMessagesForApi(messages);

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
            body.tools = tools.map(t => ToolHandler.formatToolForAPI(t)).map(t => ({ type: t.type, function: t.function }));

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

        // Handle responseFormat and smart provider configuration
        let finalProvider = provider;
        if (responseFormat) {
            if (responseFormat.type === 'json_object') {
                body.response_format = { type: 'json_object' };
            } else if (responseFormat.type === 'json_schema' && responseFormat.json_schema?.schema && responseFormat.json_schema?.name) {
                const schemaPayload: any = {
                    name: responseFormat.json_schema.name,
                    schema: responseFormat.json_schema.schema,
                };
                if (responseFormat.json_schema.strict !== undefined) {
                    schemaPayload.strict = responseFormat.json_schema.strict;
                }
                if (responseFormat.json_schema.description) {
                    schemaPayload.description = responseFormat.json_schema.description;
                }
                body.response_format = { type: 'json_schema', json_schema: schemaPayload };
            } else if (responseFormat.type === 'json_schema') {
                this.logger.warn('Invalid responseFormat for json_schema: missing `json_schema` object with `name` and `schema`. Ignored.', responseFormat);
            } else {
                if (responseFormat.type) {
                    this.logger.warn('Unknown responseFormat type. Ignored.', responseFormat);
                }
            }

            if (body.response_format) {
                if (!finalProvider) {
                    finalProvider = { require_parameters: true };
                    this.logger.debug("Automatically added 'require_parameters: true' to provider config due to 'responseFormat' usage.");
                } else if (finalProvider.require_parameters !== true) {
                    finalProvider = { ...finalProvider, require_parameters: true };
                    this.logger.debug("Automatically set 'require_parameters: true' in provider config due to 'responseFormat' usage.");
                }
            }
        }

        if (route) body.route = route;
        if (transforms && transforms.length > 0) body.transforms = transforms;
        if (finalProvider) body.provider = finalProvider;
        if (plugins && plugins.length > 0) body.plugins = plugins;
        if (reasoning) body.reasoning = reasoning;

        if (!models && this.modelFallbacks.length > 0) {
            body.models = [model, ...this.modelFallbacks];
            delete body.model;
        } else if (models && models.length > 0) {
            // Models already set
        }

        return body;
    }


    public async sendChatRequest(requestBody: Record<string, any>, depth: number): Promise<AxiosResponse<OpenRouterResponse>> {
        this.logger.debug(`(Depth ${depth}) Sending request to API... Model(s): ${requestBody.models ? requestBody.models.join(', ') : requestBody.model}`);

        if (this.debug) {
            this.logRequestDetails(requestBody, depth);
        }

        try {
            return await this.axiosInstance.post<OpenRouterResponse>('', requestBody);
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

            if (response.status === 200 && response.data) {
                const data = response.data;
                if (typeof data.total_credits === 'number' && typeof data.total_usage === 'number') {
                    const balance: CreditBalance = { 
                        total_credits: data.total_credits, 
                        total_usage: data.total_usage 
                    };
                    this.logger.log(`Credit balance fetched: Total Credits=${balance.total_credits}, Total Usage=${balance.total_usage}`);
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

    public async getApiKeyInfo(): Promise<ApiKeyInfo> {
        if (!this.apiKey) {
            throw new ConfigError('Cannot fetch API key info: API key is not set.');
        }
        const apiKeyUrl = `${this.apiBaseUrl}${API_KEY_INFO_PATH}`;
        this.logger.log(`Fetching API key info from ${apiKeyUrl}...`);

        try {
            const response = await this.axiosInstance.get(apiKeyUrl, { baseURL: '' });

            if (response.status === 200 && response.data?.data) {
                const apiKeyInfo: ApiKeyInfo = response.data;
                this.logger.log(`API key info fetched: Limit=${apiKeyInfo.data.limit}, Usage=${apiKeyInfo.data.usage}, Free Tier=${apiKeyInfo.data.is_free_tier}`);
                return apiKeyInfo;
            } else {
                this.logger.error(`Failed to fetch API key info: Status ${response.status}`, response.data);
                throw new APIError(`Failed to fetch API key info: Status ${response.status}`, response.status, response.data);
            }
        } catch (error) {
            const mappedError = mapError(error);
            this.logger.error(`Error fetching API key info: ${mappedError.message}`, mappedError.details);
            throw mappedError;
        }
    }

    public async getModels(): Promise<any[]> {
        if (!this.apiKey) {
            throw new ConfigError('Cannot fetch models: API key is not set.');
        }
        const modelsUrl = `${this.apiBaseUrl}${MODELS_API_PATH}`;
        this.logger.log(`Fetching models from ${modelsUrl}...`);

        try {
            const response = await this.axiosInstance.get(modelsUrl, { baseURL: '' });

            if (response.status === 200 && response.data?.data) {
                this.logger.log(`Successfully fetched ${response.data.data.length} models.`);
                return response.data.data as any[];
            } else {
                this.logger.error(`Failed to fetch models: Status ${response.status}`, response.data);
                throw new APIError(`Failed to fetch models: Status ${response.status}`, response.status, response.data);
            }
        } catch (error) {
            const mappedError = mapError(error);
            this.logger.error(`Error fetching models: ${mappedError.message}`, mappedError.details);
            throw mappedError;
        }
    }


    // --- Initialization and Helpers ---

    private _processProxyConfig(proxyConfig: ProxyConfig | undefined, logger: Logger): ProxyConfig {
        let processedProxy: ProxyConfig = null;
        if (proxyConfig) {
            if (typeof proxyConfig === 'string') {
                processedProxy = proxyConfig;
            } else if (typeof proxyConfig === 'object') {
                let portNumber: number;
                if (typeof proxyConfig.port === 'string') {
                    portNumber = parseInt(proxyConfig.port, 10);
                    if (isNaN(portNumber)) {
                        logger.error(`Proxy port string '${proxyConfig.port}' failed parsing. Disabling proxy.`);
                        portNumber = 0;
                    }
                } else {
                    portNumber = proxyConfig.port;
                }

                if (portNumber > 0 && portNumber <= 65535) {
                    processedProxy = {
                         host: proxyConfig.host,
                         port: portNumber,
                         ...(proxyConfig.user && { user: proxyConfig.user }),
                         ...(proxyConfig.pass && { pass: proxyConfig.pass }),
                    };
                } else {
                    logger.warn(`Invalid proxy port number: ${portNumber}. Disabling proxy.`);
                    processedProxy = null;
                }
            }
        }
        if (processedProxy) {
            logger.log('Proxy configuration processed for ApiHandler.');
        }
        return processedProxy;
    }


    private _initializeHeaders(config: ApiHandlerConfig): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
            'HTTP-Referer': config.headers?.['HTTP-Referer'] ?? DEFAULT_REFERER_URL,
            'X-Title': config.headers?.['X-Title'] ?? DEFAULT_X_TITLE,
        };

        if (config.axiosConfig?.headers) {
            for (const [key, value] of Object.entries(config.axiosConfig.headers)) {
                const lowerKey = key.toLowerCase();
                if (typeof value === 'string' && lowerKey !== 'authorization' && lowerKey !== 'content-type' && lowerKey !== 'http-referer' && lowerKey !== 'x-title') {
                    headers[key] = value;
                }
            }
        }
        return headers;
    }

    private _initializeAxiosInstance(config: ApiHandlerConfig): AxiosInstance {
        const baseAxiosConfig: AxiosRequestConfig = {
            baseURL: this.apiEndpoint,
            timeout: config.axiosConfig?.timeout ?? DEFAULT_TIMEOUT,
            headers: this.baseHeaders,
        };

        const mergedConfig: AxiosRequestConfig = {
            ...baseAxiosConfig,
            ...config.axiosConfig,
            headers: {
                ...(config.axiosConfig?.headers || {}),
                ...baseAxiosConfig.headers,
            } as any,
        };

        const axiosInstance = axios.create(mergedConfig);
        this._setupAxiosInterceptors(axiosInstance);
        return axiosInstance;
    }

    private _setupAxiosInterceptors(instance: AxiosInstance): void {
        instance.interceptors.request.use(config => {
            config.headers = config.headers || new AxiosHeaders();
            config.headers['Authorization'] = `Bearer ${this.apiKey}`;

            if (this.proxy) {
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
            return config;
        }, error => {
            const mappedError = mapError(error);
            this.logger.error('Axios Request Setup Error:', mappedError.message, mappedError.details);
            return Promise.reject(mappedError);
        });

        instance.interceptors.response.use(response => {
            return response;
        }, error => {
            const mappedError = mapError(error);
            return Promise.reject(mappedError);
        });
    }

    private logRequestDetails(requestBody: Record<string, any>, depth: number): void {
         try {
             const messagesSummary = requestBody.messages?.map((m: Message) => ({
                 role: m.role,
                 hasContent: m.content !== null && m.content !== undefined,
                 toolCalls: m.tool_calls?.length,
                 toolCallId: m.tool_call_id,
                 name: m.name
             })) || [];
             const toolsSummary = requestBody.tools?.map((t: any) => ({ type: t.type, name: t.function?.name })) || [];
             const otherKeys = Object.keys(requestBody).filter(k => !['messages', 'tools'].includes(k));
             const otherData = otherKeys.reduce((acc, key) => {
                 if (requestBody[key] !== undefined) {
                     (acc as any)[key] = requestBody[key];
                 }
                 return acc;
             }, {} as Record<string, any>);

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
}


export {};