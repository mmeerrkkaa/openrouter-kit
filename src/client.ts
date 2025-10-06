// Path: src/client.ts
import {
    OpenRouterConfig,
    OpenRouterRequestOptions,
    Message,
    Tool,
    UserAuthInfo,
    ChatCompletionResult, // Now includes toolCalls?: ToolCallDetail[]
    CreditBalance,
    ApiKeyInfo,
    ModelPricingInfo,
    OpenRouterPlugin,
    MiddlewareFunction,
    MiddlewareContext,
    IHistoryStorage,
    HistoryEntry,
    ApiCallMetadata,
    ToolCall,
    ToolCallDetail,
    ToolCallOutcome,
    StreamCallbacks,
    ChatStreamResult
  } from './types';
  import { ToolHandler } from './tool-handler';
  import { formatDateTime } from './utils/formatting';
  import { validateConfig } from './utils/validation';
  import {
      mapError,
      OpenRouterError,
      ErrorCode,
      ConfigError,
      AuthorizationError,
      AuthenticationError,
      ToolError,
  } from './utils/error';
  import * as jsonUtils from './utils/json-utils';
  import { Logger } from './utils/logger';
  import {
      DEFAULT_MODEL,
      DEFAULT_CHATS_FOLDER,
      DEFAULT_MAX_TOOL_CALLS
  } from './config';
  import { SecurityManager } from './security/security-manager';
  import { SimpleEventEmitter } from './utils/simple-event-emitter';
  import { CostTracker } from './cost-tracker';
  import { UnifiedHistoryManager } from './history/unified-history-manager';
  import { MemoryHistoryStorage } from './history/memory-storage';
  import { HistoryAnalyzer } from './history/history-analyzer';

  // --- Import Core Components ---
  import { ApiHandler } from './core/api-handler';
  import { ChatProcessor } from './core/chat-processor';
  import { PluginManager } from './core/plugin-manager';
  import { prepareMessagesForApi, filterHistoryForApi } from './core/message-preparer';

  export class OpenRouterClient {
      private config: OpenRouterConfig;
      private logger: Logger;
      private clientEventEmitter: SimpleEventEmitter;

      // Core Logic Components
      private apiHandler: ApiHandler;
      private chatProcessor: ChatProcessor;
      private pluginManager: PluginManager;

      // Managers
      private unifiedHistoryManager: UnifiedHistoryManager;
      private securityManager: SecurityManager | null;
      private costTracker: CostTracker | null;
      private historyAnalyzer: HistoryAnalyzer;

      // State
      private currentModel: string;

      constructor(config: OpenRouterConfig) {
          validateConfig(config);
          this.config = config;

          const debugMode = config.debug ?? false;
          this.logger = new Logger({ debug: debugMode, prefix: 'OpenRouterClient' });
          jsonUtils.setJsonUtilsLogger(this.logger.withPrefix('JsonUtils'));
          this.clientEventEmitter = new SimpleEventEmitter();
          this.logger.log('Initializing OpenRouter Kit v2 (Refactored)...');

          this.unifiedHistoryManager = this._initializeHistoryManager(config);
          this.securityManager = this._initializeSecurityManager(config);

          this.apiHandler = new ApiHandler({
              apiKey: config.apiKey,
              apiEndpoint: config.apiEndpoint,
              apiBaseUrl: config.apiBaseUrl,
              proxy: config.proxy,
              headers: config.axiosConfig?.headers as Record<string, string> | undefined,
              axiosConfig: config.axiosConfig,
              modelFallbacks: config.modelFallbacks,
              logger: this.logger,
              debug: debugMode,
          });

          this.costTracker = this._initializeCostTracker(config, this.apiHandler.getAxiosInstance());
          this.pluginManager = new PluginManager(this.logger);
          this.historyAnalyzer = new HistoryAnalyzer(this.unifiedHistoryManager, this.logger);

          this.chatProcessor = new ChatProcessor(
              {
                  apiHandler: this.apiHandler,
                  historyManager: this.unifiedHistoryManager,
                  securityManager: this.securityManager,
                  costTracker: this.costTracker,
                  logger: this.logger,
                  filterMessagesForApi: filterHistoryForApi
              },
              {
                  defaultModel: config.model || DEFAULT_MODEL,
                  defaultMaxToolCalls: config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
                  defaultStrictJsonParsing: config.strictJsonParsing ?? false,
                  debug: debugMode
              }
          );

          this.currentModel = config.model || DEFAULT_MODEL;
          this.logger.log('OpenRouter Kit successfully initialized.');
      }

      // --- Initialization Helpers ---

      private _initializeHistoryManager(config: OpenRouterConfig): UnifiedHistoryManager {
          let historyAdapter: IHistoryStorage;
          if (config.historyAdapter) {
              this.logger.log('Using custom history adapter.');
              historyAdapter = config.historyAdapter;
          } else {
              this.logger.log('Defaulting to MemoryHistoryStorage.');
              if (config.historyStorage === 'disk') {
                   this.logger.warn(`'historyStorage: disk' without 'historyAdapter' is deprecated. Using MemoryHistoryStorage. 'chatsFolder' ignored.`);
              }
              historyAdapter = new MemoryHistoryStorage();
          }
          const manager = new UnifiedHistoryManager(historyAdapter, {
              ttlMs: config.historyTtl,
              cleanupIntervalMs: config.historyCleanupInterval,
          }, this.logger.withPrefix('UnifiedHistoryManager'));
          this.logger.log(`HistoryManager initialized with adapter: ${historyAdapter.constructor.name}`);
          return manager;
      }

      private _initializeSecurityManager(config: OpenRouterConfig): SecurityManager | null {
          if (config.security) {
              // Cast to ExtendedSecurityConfig if necessary, assuming SecurityManager constructor handles it
              const manager = new SecurityManager(config.security as any, config.debug ?? false);
              this.logger.log('SecurityManager initialized.');
              return manager;
          } else {
              this.logger.log('SecurityManager not used.');
              return null;
          }
      }

      private _initializeCostTracker(config: OpenRouterConfig, axiosInstance: any): CostTracker | null {
           if (config.enableCostTracking) {
               this.logger.log('Cost tracking enabled. Initializing CostTracker...');
               const apiBaseUrl = config.apiBaseUrl || this.apiHandler.apiBaseUrl;
               if (!apiBaseUrl) {
                    this.logger.error("Cannot initialize CostTracker: apiBaseUrl is missing in config and could not be determined.");
                    return null;
               }
               const tracker = new CostTracker(
                   axiosInstance,
                   this.logger,
                   {
                       enableCostTracking: true,
                       priceRefreshIntervalMs: config.priceRefreshIntervalMs,
                       initialModelPrices: config.initialModelPrices,
                       apiBaseUrl: apiBaseUrl
                   }
               );
               return tracker;
           } else {
               this.logger.log('Cost tracking disabled.');
               return null;
           }
       }

      // --- Core Chat Logic ---

      public async chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult> {
          const chatStartTime = Date.now();
          const logIdentifier = options.prompt
              ? `prompt: "${options.prompt.substring(0, 50)}..."`
              : `customMessages: ${options.customMessages?.length ?? 0}`;
          this.logger.log(`Processing chat request (${logIdentifier})...`);

          const ctx: MiddlewareContext = {
              request: { options }, // Pass full options including includeToolResultInReport
              metadata: {}
          };

          let finalResult: ChatCompletionResult | null = null;
          let processingError: OpenRouterError | null = null;
          let entriesToSave: HistoryEntry[] = [];

          try {
              await this.pluginManager.runMiddlewares(ctx, async () => {
                  // Core Logic inside Middleware
                  const effectiveOptions = ctx.request.options;

                  if (!effectiveOptions.customMessages && !effectiveOptions.prompt) {
                      throw new ConfigError("'prompt' or 'customMessages' must be provided in options");
                  }

                  // 1. Authentication / Authorization
                  let userInfo: UserAuthInfo | null = null;
                  if (this.securityManager) {
                      const accessToken = effectiveOptions.accessToken;
                      const secConfig = this.securityManager.getConfig();
                      if (accessToken) {
                          userInfo = await this.securityManager.authenticateUser(accessToken);
                          if (!userInfo && secConfig.requireAuthentication) {
                              throw new AuthenticationError('Authentication failed (token invalid/missing) but is required.', 401);
                          }
                          this.logger.debug(`Authentication attempt complete. User: ${userInfo?.userId || 'anonymous/failed'}`);
                      } else if (secConfig.requireAuthentication) {
                          throw new AuthorizationError('Access token is required but was not provided.', 401);
                      }
                  } else if (effectiveOptions.accessToken) {
                       this.logger.warn('accessToken provided, but SecurityManager not configured.');
                   }

                  // 2. Load History
                  let initialHistoryEntries: HistoryEntry[] = [];
                  const user = effectiveOptions.user;
                  const group = effectiveOptions.group;
                  if (user && !effectiveOptions.customMessages) {
                      const historyKey = this._getHistoryKey(user, group);
                      try {
                          initialHistoryEntries = await this.unifiedHistoryManager.getHistoryEntries(historyKey);
                          this.logger.debug(`Loaded ${initialHistoryEntries.length} history entries for key '${historyKey}'.`);
                      } catch (histError) {
                          this.logger.error(`Error loading history entries for key '${historyKey}':`, mapError(histError));
                      }
                  }

                  // 3. Prepare Initial Messages for API
                  const initialMessages = await prepareMessagesForApi(
                      {
                          user: effectiveOptions.user,
                          group: effectiveOptions.group,
                          prompt: effectiveOptions.prompt || '',
                          systemPrompt: effectiveOptions.systemPrompt,
                          customMessages: effectiveOptions.customMessages,
                          _loadedHistoryEntries: initialHistoryEntries,
                          getHistoryKeyFn: this._getHistoryKey.bind(this)
                      },
                      this.unifiedHistoryManager,
                      this.logger
                  );

                  // 4. Prepare initial HistoryEntry for the user prompt
                  entriesToSave = [];
                  if (effectiveOptions.prompt) {
                      const userMessage = initialMessages.find((m: Message) => m.role === 'user' && m.content === effectiveOptions.prompt);
                      let messageToAdd = userMessage;
                       if (!messageToAdd && !effectiveOptions.customMessages && initialMessages.length > 0 && initialMessages[initialMessages.length - 1].role === 'user') {
                            messageToAdd = initialMessages[initialMessages.length - 1];
                       }
                      if (messageToAdd) {
                          const messageWithTimestamp = { ...messageToAdd, timestamp: messageToAdd.timestamp || formatDateTime() };
                          entriesToSave.push({ message: messageWithTimestamp, apiCallMetadata: null });
                      }
                  }

                  // 5. Process Chat via ChatProcessor
                  // Pass the full effectiveOptions, which includes includeToolResultInReport
                  const processorResult = await this.chatProcessor.processChat({
                      initialMessages: initialMessages,
                      requestOptions: effectiveOptions,
                      userInfo: userInfo,
                  });

                  // 6. Associate Metadata and Prepare History Entries for Saving
                  // Note: Newly added messages now include the final assistant message AND tool result messages
                  if (processorResult.apiCallMetadata) {
                      const metadata = processorResult.apiCallMetadata;
                      processorResult.newlyAddedMessages.forEach((msg: Message) => {
                          const messageWithTimestamp = { ...msg, timestamp: msg.timestamp || formatDateTime() };
                          entriesToSave.push({ message: messageWithTimestamp, apiCallMetadata: metadata });
                      });
                  } else {
                      // This case might be less common now if metadata is always generated
                      processorResult.newlyAddedMessages.forEach((msg: Message) => {
                           const messageWithTimestamp = { ...msg, timestamp: msg.timestamp || formatDateTime() };
                          entriesToSave.push({ message: messageWithTimestamp, apiCallMetadata: null });
                      });
                  }

                  // 7. Construct Final Result (now includes toolCalls details)
                  const duration = Date.now() - chatStartTime;
                  finalResult = {
                      content: processorResult.content,
                      usage: processorResult.usage,
                      model: processorResult.model,
                      toolCallsCount: processorResult.toolCallsCount,
                      toolCalls: processorResult.toolCalls, // Include the details array
                      finishReason: processorResult.finishReason,
                      durationMs: duration,
                      id: processorResult.id,
                      cost: processorResult.cost,
                      reasoning: processorResult.reasoning,
                      annotations: processorResult.annotations,
                  };

                  this.logger.log(`Chat request (${logIdentifier}) processed successfully in ${finalResult.durationMs} ms.`);
                  ctx.response = { ...(ctx.response || {}), result: finalResult };

              }); // End of core logic inside middleware

          } catch (error) {
              processingError = mapError(error);
              this.logger.error(`Error during chat processing (${logIdentifier}): ${processingError.message}`, processingError.details || processingError);
              this._handleError(processingError);
              if (!ctx.response?.error) {
                   ctx.response = { ...(ctx.response || {}), error: processingError };
              }
          }

          // --- History Saving ---
          const user = options.user;
          const group = options.group;
          if (user && Array.isArray(entriesToSave) && entriesToSave.length > 0) {
              const historyKey = this._getHistoryKey(user, group);
              try {
                  // Save all generated messages (user prompt, assistant, tool results)
                  await this.unifiedHistoryManager.addHistoryEntries(historyKey, entriesToSave);
                  this.logger.debug(`Saved ${entriesToSave.length} history entries for key '${historyKey}' (Success: ${!processingError}).`);
              } catch (histError) {
                  this.logger.error(`Error saving history entries for key '${historyKey}' after chat completion:`, mapError(histError));
              }
          } else if (user) {
               this.logger.debug(`No new history entries to save for key '${this._getHistoryKey(user, group)}'.`);
           }

          // --- Final Return/Throw ---
          if (ctx.response?.error) {
              throw ctx.response.error;
          }
          if (finalResult) {
              return finalResult;
          }

          this.logger.error("Chat processing finished unexpectedly without a result or error.");
          throw new OpenRouterError('Chat processing did not produce a result or error', ErrorCode.INTERNAL_ERROR);
      }


      // --- Helper Methods ---

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

      private _handleError(error: OpenRouterError): void {
          const finalError = mapError(error);
          this.clientEventEmitter.emit('error', finalError);
      }

      // --- Public API Methods ---

      public getHistoryManager(): UnifiedHistoryManager {
          return this.unifiedHistoryManager;
      }

      public getHistoryAnalyzer(): HistoryAnalyzer {
          if (!this.historyAnalyzer) {
               this.logger.warn("HistoryAnalyzer accessed before initialization.");
               this.historyAnalyzer = new HistoryAnalyzer(this.unifiedHistoryManager, this.logger);
          }
          return this.historyAnalyzer;
      }

      public isDebugMode(): boolean {
          return this.logger.isDebugEnabled();
      }

      public getSecurityManager(): SecurityManager | null {
          return this.securityManager;
      }

      public isSecurityEnabled(): boolean {
          return this.securityManager !== null;
      }

      public getCostTracker(): CostTracker | null {
          return this.costTracker;
      }

      public getDefaultModel(): string {
          return this.currentModel;
      }

      public setModel(model: string): void {
          if (!model || typeof model !== 'string') {
              throw new ConfigError('Model name must be a non-empty string');
          }
          this.logger.log(`Default model changed from '${this.currentModel}' to '${model}'`);
          this.currentModel = model;
          if (this.chatProcessor) {
              this.chatProcessor['config'].defaultModel = model;
          }
      }

      public setApiKey(apiKey: string): void {
          if (!apiKey || typeof apiKey !== 'string') {
              throw new ConfigError('API key must be a non-empty string');
          }
          this.logger.log('Updating API key...');
          this.apiHandler.updateApiKey(apiKey);
          this.logger.log('API key successfully updated.');
      }

      public createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string {
          if (!this.securityManager) {
              throw new ConfigError('Cannot create token: SecurityManager not configured.');
          }
          this.logger.log(`Requesting access token creation via SecurityManager for user ${userInfo.userId}...`);
          try {
              // Cast to the ExtendedUserAuthInfo expected by SecurityManager internally
              return this.securityManager.createAccessToken(userInfo as Omit<import('./security/types').ExtendedUserAuthInfo, 'expiresAt'>, expiresIn);
          } catch (error) {
              throw mapError(error);
          }
      }

      public async getCreditBalance(): Promise<CreditBalance> {
          return this.apiHandler.getCreditBalance();
      }

      public async getApiKeyInfo(): Promise<ApiKeyInfo> {
          return this.apiHandler.getApiKeyInfo();
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
      public on(event: string, handler: (event: any) => void): this {
          if (event === 'error') {
              this.clientEventEmitter.on(event, handler as (error: OpenRouterError) => void);
              this.logger.debug(`Added client event handler for: ${event}`);
          } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:') || event.startsWith('config:') || event.startsWith('cache:') || event.startsWith('auth:') )) {
              this.logger.debug(`Adding security event handler for: ${event}`);
              this.securityManager.on(event, handler);
          } else {
              this.logger.warn(`Subscribing to non-'error' or non-'security:' events directly on the client is not standard. Event: '${event}'`);
              // Allow subscribing to other events emitted by clientEventEmitter if needed
              // this.clientEventEmitter.on(event, handler);
          }
          return this;
      }

      public off(event: string, handler: (event: any) => void): this {
          if (event === 'error') {
              this.clientEventEmitter.off(event, handler as (error: OpenRouterError) => void);
              this.logger.debug(`Removed client event handler for: ${event}`);
          } else if (this.securityManager && (event.startsWith('security:') || event.startsWith('user:') || event.startsWith('token:') || event.startsWith('access:') || event.startsWith('ratelimit:') || event.startsWith('tool:') || event.startsWith('config:') || event.startsWith('cache:') || event.startsWith('auth:') )) {
              this.logger.debug(`Removing security event handler for: ${event}`);
              this.securityManager.off(event, handler);
          } else {
              this.logger.warn(`Cannot unsubscribe from non-'error' or non-'security:' event '${event}' via client.`);
              // Allow unsubscribing from other events emitted by clientEventEmitter if needed
              // this.clientEventEmitter.off(event, handler);
          }
          return this;
      }

      public async destroy(): Promise<void> {
          this.logger.log('Destroying OpenRouterClient and components...');
          await this.unifiedHistoryManager?.destroy?.();
          this.securityManager?.destroy?.();
          this.costTracker?.destroy?.();
          await this.pluginManager?.destroyPlugins?.();
          this.clientEventEmitter.removeAllListeners();
          this.logger.debug('Client event listeners removed.');
          this.logger.log('OpenRouterClient successfully destroyed.');
      }

      // --- Streaming Chat ---

      public async chatStream(
          options: OpenRouterRequestOptions & { streamCallbacks?: StreamCallbacks },
          abortSignal?: AbortSignal
      ): Promise<ChatStreamResult> {
          const chatStartTime = Date.now();
          const logIdentifier = options.prompt
              ? `prompt: "${options.prompt.substring(0, 50)}..."`
              : `customMessages: ${options.customMessages?.length ?? 0}`;
          this.logger.log(`Processing streaming chat request (${logIdentifier})...`);

          if (!options.customMessages && !options.prompt) {
              throw new ConfigError("'prompt' or 'customMessages' must be provided in options");
          }

          try {

          // 1. Authentication / Authorization
          let userInfo: UserAuthInfo | null = null;
          if (this.securityManager) {
              const accessToken = options.accessToken;
              const secConfig = this.securityManager.getConfig();
              if (accessToken) {
                  userInfo = await this.securityManager.authenticateUser(accessToken);
                  if (!userInfo && secConfig.requireAuthentication) {
                      throw new AuthenticationError('Authentication failed (token invalid/missing) but is required.', 401);
                  }
                  this.logger.debug(`Streaming authentication complete. User: ${userInfo?.userId || 'anonymous/failed'}`);
              } else if (secConfig.requireAuthentication) {
                  throw new AuthorizationError('Access token is required but was not provided.', 401);
              }

              // NOTE: In streaming mode, tool calls are NOT auto-executed, so detailed
              // security checks (rate limiting, tool access control, argument sanitization)
              // are deferred. If users want automatic tool execution with full security,
              // they should use the regular client.chat() method instead.
              this.logger.debug('Streaming mode: Tool security checks deferred (tools not auto-executed).');
          } else if (options.accessToken) {
               this.logger.warn('accessToken provided, but SecurityManager not configured.');
           }

          // 2. Load History
          let initialHistoryEntries: HistoryEntry[] = [];
          const user = options.user;
          const group = options.group;
          if (user && !options.customMessages) {
              const historyKey = this._getHistoryKey(user, group);
              try {
                  initialHistoryEntries = await this.unifiedHistoryManager.getHistoryEntries(historyKey);
                  this.logger.debug(`Loaded ${initialHistoryEntries.length} history entries for key '${historyKey}'.`);
              } catch (histError) {
                  this.logger.error(`Error loading history entries for key '${historyKey}':`, mapError(histError));
              }
          }

          // 3. Prepare Initial Messages for API
          const initialMessages = await prepareMessagesForApi(
              {
                  user: options.user,
                  group: options.group,
                  prompt: options.prompt || '',
                  systemPrompt: options.systemPrompt,
                  customMessages: options.customMessages,
                  _loadedHistoryEntries: initialHistoryEntries,
                  getHistoryKeyFn: this._getHistoryKey.bind(this)
              },
              this.unifiedHistoryManager,
              this.logger
          );

          // 4. Build request body
          const requestBody = this.apiHandler.buildChatRequestBody({
              model: options.model || this.currentModel,
              messages: initialMessages,
              tools: options.tools,
              responseFormat: options.responseFormat,
              temperature: options.temperature,
              maxTokens: options.maxTokens,
              topP: options.topP,
              presencePenalty: options.presencePenalty,
              frequencyPenalty: options.frequencyPenalty,
              stop: options.stop,
              logitBias: options.logitBias,
              seed: options.seed,
              toolChoice: options.toolChoice,
              parallelToolCalls: options.parallelToolCalls,
              route: options.route,
              transforms: options.transforms,
              provider: options.provider,
              models: options.models,
              plugins: options.plugins,
              reasoning: options.reasoning,
              filterMessagesForApi: filterHistoryForApi
          });

          // 5. Send streaming request
          let result = await this.apiHandler.sendStreamingChatRequest(
              requestBody,
              options.streamCallbacks,
              abortSignal
          );

          // 5.1. Auto-execute tools if tool calls detected (just like client.chat())
          if (options.tools && result.toolCalls && result.toolCalls.length > 0 && result.finishReason === 'tool_calls') {
              this.logger.log(`Executing ${result.toolCalls.length} tool(s) in streaming mode...`);

              const conversationMessages: Message[] = [
                  ...initialMessages,
                  {
                      role: 'assistant',
                      content: result.content || null,
                      tool_calls: result.toolCalls,
                      timestamp: formatDateTime()
                  }
              ];

              // Execute tools and collect results
              for (const toolCall of result.toolCalls) {
                  const tool = options.tools?.find(t => (t.function?.name || t.name) === toolCall.function.name);

                  if (!tool) {
                      this.logger.warn(`Tool '${toolCall.function.name}' not found in provided tools list`);
                      continue;
                  }

                  try {
                      options.streamCallbacks?.onToolCallExecuting?.(toolCall.function.name, JSON.parse(toolCall.function.arguments));

                      // Execute tool (with security checks via toolHandler if available)
                      const toolContext = { userInfo: userInfo || undefined };
                      let toolResult: any;

                      if (this.securityManager && userInfo) {
                          // Full security check
                          await this.securityManager.checkToolAccessAndArgs(tool, userInfo, JSON.parse(toolCall.function.arguments));
                      }

                      toolResult = await tool.execute(JSON.parse(toolCall.function.arguments), toolContext);
                      options.streamCallbacks?.onToolCallResult?.(toolCall.function.name, toolResult);

                      // Add tool result to conversation
                      conversationMessages.push({
                          role: 'tool',
                          tool_call_id: toolCall.id,
                          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                          timestamp: formatDateTime()
                      });
                  } catch (toolError: any) {
                      this.logger.error(`Error executing tool '${toolCall.function.name}':`, toolError);
                      conversationMessages.push({
                          role: 'tool',
                          tool_call_id: toolCall.id,
                          content: JSON.stringify({ error: toolError.message || 'Tool execution failed' }),
                          timestamp: formatDateTime()
                      });
                  }
              }

              // Continue streaming with tool results
              const followUpBody = this.apiHandler.buildChatRequestBody({
                  model: options.model || this.currentModel,
                  messages: conversationMessages,
                  tools: options.tools,
                  responseFormat: options.responseFormat,
                  temperature: options.temperature,
                  maxTokens: options.maxTokens,
                  topP: options.topP,
                  presencePenalty: options.presencePenalty,
                  frequencyPenalty: options.frequencyPenalty,
                  stop: options.stop,
                  logitBias: options.logitBias,
                  seed: options.seed,
                  toolChoice: options.toolChoice,
                  parallelToolCalls: options.parallelToolCalls,
                  route: options.route,
                  transforms: options.transforms,
                  provider: options.provider,
                  models: options.models,
                  plugins: options.plugins,
                  reasoning: options.reasoning,
                  filterMessagesForApi: filterHistoryForApi
              });

              // Stream final response
              result = await this.apiHandler.sendStreamingChatRequest(
                  followUpBody,
                  options.streamCallbacks,
                  abortSignal
              );
          }

          // 6. Calculate cost if cost tracker is enabled
          let calculatedCost: number | null = null;
          if (this.costTracker && result.usage) {
              const modelUsed = result.model || options.model || this.currentModel;
              calculatedCost = this.costTracker.calculateCost(modelUsed, result.usage);
              this.logger.debug(`Calculated streaming cost: $${calculatedCost} for model ${modelUsed}`);
          }

          // 7. Save to history if user is provided
          if (user && options.prompt) {
              const historyKey = this._getHistoryKey(user, group);
              try {
                  const userMessage: Message = {
                      role: 'user',
                      content: options.prompt,
                      timestamp: formatDateTime()
                  };
                  const assistantMessage: Message = {
                      role: 'assistant',
                      content: result.content || null,
                      timestamp: formatDateTime(),
                      ...(result.toolCalls && result.toolCalls.length > 0 && { tool_calls: result.toolCalls }),
                      ...(result.reasoning && { reasoning: result.reasoning }),
                      ...(result.annotations && result.annotations.length > 0 && { annotations: result.annotations })
                  };
                  const metadata: ApiCallMetadata = {
                      callId: result.id || `stream-${Date.now()}`,
                      modelUsed: result.model || options.model || this.currentModel,
                      usage: result.usage || null,
                      cost: calculatedCost,
                      timestamp: Date.now(),
                      finishReason: result.finishReason || null
                  };

                  await this.unifiedHistoryManager.addHistoryEntries(historyKey, [
                      { message: userMessage, apiCallMetadata: null },
                      { message: assistantMessage, apiCallMetadata: metadata }
                  ]);
                  this.logger.debug(`Saved streaming chat to history for key '${historyKey}'.`);
              } catch (histError) {
                  this.logger.error(`Error saving streaming chat to history:`, mapError(histError));
              }
          }

          const duration = Date.now() - chatStartTime;
          this.logger.log(`Streaming chat request (${logIdentifier}) completed in ${duration}ms.`);

          // Return result with cost
          return {
              ...result,
              cost: calculatedCost,
              durationMs: duration
          };

          } catch (error) {
              const mappedError = mapError(error);
              this.logger.error(`Error during streaming chat (${logIdentifier}): ${mappedError.message}`, mappedError.details || mappedError);
              this._handleError(mappedError);
              throw mappedError;
          }
      }

      // --- Plugin and Middleware Management ---

      public async use(plugin: OpenRouterPlugin): Promise<void> {
          await this.pluginManager.registerPlugin(plugin, this);
      }

      public useMiddleware(fn: MiddlewareFunction): void {
          this.pluginManager.registerMiddleware(fn);
      }

      // --- Internal setters for plugins ---

      /** @internal */
      public setSecurityManager(securityManager: SecurityManager | null): void {
          this.securityManager?.destroy?.();
          this.securityManager = securityManager;
          this.logger.log(`SecurityManager instance ${securityManager ? 'replaced' : 'removed'} via plugin/method call.`);
          this.securityManager?.setDebugMode(this.isDebugMode());
          if (this.chatProcessor) {
               this.chatProcessor['securityManager'] = securityManager;
          }
      }

      /** @internal */
      public setCostTracker(costTracker: CostTracker | null): void {
          this.costTracker?.destroy?.();
          this.costTracker = costTracker;
          this.logger.log(`CostTracker instance ${costTracker ? 'replaced' : 'removed'} via plugin/method call.`);
           if (this.chatProcessor) {
                this.chatProcessor['costTracker'] = costTracker;
           }
      }

      // --- Deprecated Methods ---

      /** @deprecated Tool processing is now integrated into client.chat(). Use the main chat method instead. */
      public async handleToolCalls(params: {
          message: Message & { tool_calls?: ToolCall[] };
          messages: Message[]; // This parameter seems unused in the original logic
          tools?: Tool[];
          debug?: boolean; // This is now controlled by client config
          accessToken?: string;
          // Cannot easily add includeToolResultInReport here without breaking signature further
        }): Promise<Message[]> {
          this.logger.warn("Method client.handleToolCalls() is deprecated and will be removed. Tool processing is integrated into client.chat().");
          const { message, tools = [], accessToken } = params;
          if (!message?.tool_calls?.length) return [];
          if (!Array.isArray(tools) || tools.length === 0) throw new ToolError("Tool processing failed: No tools defined.");

          let userInfo: UserAuthInfo | null = null;
           if (this.securityManager && accessToken) {
               try { userInfo = await this.securityManager.authenticateUser(accessToken); } catch (e) { /* ignore */ }
           }
           // Call the internal handler, which now returns ToolCallOutcome[]
           const outcomes = await ToolHandler.handleToolCalls({
               message: message as Message & { tool_calls: ToolCall[] },
               debug: this.isDebugMode(), // Use client's debug state
               tools: tools,
               securityManager: this.securityManager || undefined,
               userInfo: userInfo,
               logger: this.logger.withPrefix('ToolHandler(Deprecated)'),
               parallelCalls: true,
               includeToolResultInReport: false
           });
           // Return only the messages for backward compatibility
           return outcomes.map(o => o.message);
      }
  }