// Path: src/types/index.ts
import type { AxiosRequestConfig } from 'axios';
import type { ISecurityManager } from '../security/types';
import type { Logger } from '../utils/logger';

// --- Plugin and Middleware Types ---

export interface OpenRouterPlugin {
  init(client: import('../client').OpenRouterClient): Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

export interface MiddlewareContext {
  request: {
    options: OpenRouterRequestOptions;
  };
  response?: {
    result?: ChatCompletionResult;
    rawResponse?: any;
    error?: any;
  };
  metadata?: Record<string, any>;
}

export type MiddlewareFunction = (
    ctx: MiddlewareContext,
    next: () => Promise<void>
) => Promise<void>;

// --- History Storage Related Types ---

/** Metadata associated with the API call that produced a message or group of messages. */
export interface ApiCallMetadata { // EXPORTED
    callId: string;
    modelUsed: string;
    usage: UsageInfo | null;
    cost: number | null;
    timestamp: number;
    finishReason: string | null;
    requestMessagesCount?: number;
}

/** Represents a single entry in the history, linking a message to its originating API call. */
export interface HistoryEntry { // EXPORTED
    message: Message;
    apiCallMetadata?: ApiCallMetadata | null;
}

// --- History Storage Adapter Interface ---

export interface IHistoryStorage {
  load(key: string): Promise<HistoryEntry[]>; // Uses HistoryEntry
  save(key: string, entries: HistoryEntry[]): Promise<void>; // Uses HistoryEntry
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
  destroy?: () => Promise<void> | void;
}

// --- Core Message and Tool Types ---

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  role: Role;
  content: string | null;
  timestamp?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  reasoning?: string | null;
  annotations?: UrlCitationAnnotation[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// --- Tool Definition ---

export interface ToolContext {
  userInfo?: UserAuthInfo;
  securityManager?: ISecurityManager;
  logger?: Logger;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
  execute: (args: any, context?: ToolContext) => Promise<any> | any;
  security?: ToolSecurity;
  name?: string;
}

// --- Security Related Types (Base definitions) ---

export interface RateLimit {
  limit: number;
  period: 'second' | 'minute' | 'hour' | 'day';
}

export interface DangerousArgumentsConfig {
  globalPatterns?: Array<string | RegExp>;
  toolSpecificPatterns?: Record<string, Array<string | RegExp>>;
  blockedValues?: string[];
}

export interface ToolSecurity {
  requiredRole?: string | string[];
  requiredScopes?: string | string[];
  rateLimit?: RateLimit;
}

export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom';
  jwtSecret?: string;
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null;
}

export interface UserAuthInfo {
  userId: string;
  role?: string;
  scopes?: string[];
  expiresAt?: number;
  apiKey?: string;
  [key: string]: any;
}

export interface ToolAccessConfig {
  allow?: boolean;
  roles?: string | string[];
  scopes?: string | string[];
  rateLimit?: RateLimit;
  allowedApiKeys?: string[];
}

export interface RoleConfig {
  allowedTools?: string | string[] | '*';
  rateLimits?: Record<string, RateLimit>;
}

export interface RolesConfig {
  roles?: Record<string, RoleConfig>;
}

export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all';
  userAuthentication?: UserAuthConfig;
  toolAccess?: Record<string, ToolAccessConfig>;
  roles?: RolesConfig;
  requireAuthentication?: boolean;
}

// --- Event Types ---

export interface ToolCallEvent {
  toolName: string;
  userId: string;
  args: any;
  result: any;
  success: boolean;
  error?: Error;
  timestamp: number;
}

// --- History Types (Legacy - For reference) ---

/** @deprecated Use IHistoryStorage interface instead */
export type HistoryStorageType = 'memory' | 'disk';

// --- API Interaction Types ---

export interface ResponseFormat {
  type: 'json_object' | 'json_schema';
  json_schema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, any>;
    description?: string;
  };
}

export interface ProviderRoutingConfig {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: 'allow' | 'deny';
  ignore?: string[];
  quantizations?: string[];
  sort?: 'price' | 'throughput' | 'latency';
}

export interface PluginConfig {
    id: string;
    max_results?: number;
    search_prompt?: string;
    [key: string]: any;
}

export interface ReasoningConfig {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
}

export interface ModelPricingInfo {
    id: string;
    name?: string;
    promptCostPerMillion: number;
    completionCostPerMillion: number;
    context_length?: number;
}

export interface UrlCitationAnnotation {
    type: 'url_citation';
    url_citation: {
      url: string;
      title: string;
      content?: string;
      start_index: number;
      end_index: number;
    };
}

// --- Main Client Configuration and Request Options ---

export interface OpenRouterConfig {
  // Core
  apiKey: string;
  apiEndpoint?: string;
  apiBaseUrl?: string; // Ensure this exists
  model?: string;
  debug?: boolean;

  // Network & Headers
  proxy?: string | {
    host: string;
    port: number | string;
    user?: string;
    pass?: string;
  } | null;
  referer?: string;
  title?: string;
  axiosConfig?: AxiosRequestConfig;

  // History Management
  historyAdapter?: IHistoryStorage; // Uses updated IHistoryStorage
  historyTtl?: number;
  historyCleanupInterval?: number;
  /** @deprecated Use historyAdapter */
  historyStorage?: HistoryStorageType;
  /** @deprecated Configure path in DiskHistoryStorage adapter */
  chatsFolder?: string;
  /** @deprecated Limit handling depends on history adapter/manager */
  maxHistoryEntries?: number;
  /** @deprecated Auto-saving depends on history adapter */
  historyAutoSave?: boolean;

  // Model Behavior & Routing
  defaultProviderRouting?: ProviderRoutingConfig;
  modelFallbacks?: string[];
  responseFormat?: ResponseFormat | null;
  maxToolCalls?: number;
  strictJsonParsing?: boolean;

  // Security
  security?: SecurityConfig;

  // Cost Tracking
  enableCostTracking?: boolean;
  priceRefreshIntervalMs?: number;
  initialModelPrices?: Record<string, ModelPricingInfo>;

  // Deprecated/Unused?
  enableReasoning?: boolean;
  webSearch?: boolean;
}

export interface OpenRouterRequestOptions {
  // Input Content
  prompt?: string;
  customMessages?: Message[] | null;

  // Context & History
  user?: string;
  group?: string | null;
  systemPrompt?: string | null;
  accessToken?: string | null;

  // Model & Generation Parameters
  model?: string;
  temperature?: number;
  maxTokens?: number | null;
  topP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  stop?: string | string[] | null;
  seed?: number | null;
  logitBias?: Record<string, number> | null;

  // Tool / Function Calling
  tools?: Tool[] | null;
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null;
  parallelToolCalls?: boolean;
  maxToolCalls?: number;

  // Response Formatting
  responseFormat?: ResponseFormat | null;
  strictJsonParsing?: boolean;

  // Routing and Transforms
  route?: string;
  transforms?: string[];
  provider?: ProviderRoutingConfig;
  models?: string[];
  plugins?: PluginConfig[];
  reasoning?: ReasoningConfig;
}

// --- API Response Structures ---

export interface UsageInfo {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    [key: string]: any;
}

export interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: Message;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    logprobs?: any | null;
  }>;
  usage?: UsageInfo;
  system_fingerprint?: string;
  error?: { message?: string; type?: string; code?: string; [key: string]: any } | string;
}

export interface ChatCompletionResult {
  content: any;
  usage: UsageInfo | null;
  model: string;
  toolCallsCount: number;
  finishReason: string | null;
  durationMs: number;
  id?: string;
  cost?: number | null;
  reasoning?: string | null;
  annotations?: UrlCitationAnnotation[];
}

export interface CreditBalance {
    limit: number;
    usage: number;
}