// Path: src/types/index.ts
import type { AxiosRequestConfig } from 'axios';
import type { ISecurityManager } from '../security/types';
import type { Logger } from '../utils/logger';
// Import ErrorCode for use in ToolCallDetail
import { ErrorCode } from '../utils/error';

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

export interface ApiCallMetadata {
    callId: string;
    modelUsed: string;
    usage: UsageInfo | null;
    cost: number | null;
    timestamp: number;
    finishReason: string | null;
    requestMessagesCount?: number;
}

export interface HistoryEntry {
    message: Message;
    apiCallMetadata?: ApiCallMetadata | null;
}

// --- History Storage Adapter Interface ---

export interface IHistoryStorage {
  load(key: string): Promise<HistoryEntry[]>;
  save(key: string, entries: HistoryEntry[]): Promise<void>;
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
    arguments: string; // Arguments as a JSON string from the LLM
  };
}

// --- Tool Definition ---

export interface ToolContext {
  userInfo?: UserAuthInfo;
  securityManager?: ISecurityManager;
  logger?: Logger;
  includeToolResultInReport?: boolean;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>; // JSON Schema
  };
  execute: (args: any, context?: ToolContext) => Promise<any> | any;
  security?: ToolSecurity;
  name?: string; // Optional alternative name (used if function.name is missing?)
}

// --- Tool Call Reporting Types ---

export type ToolCallStatus = 'success' | 'error_parsing' | 'error_validation' | 'error_security' | 'error_execution' | 'error_unknown' | 'error_not_found';

export interface ToolCallDetail {
    toolCallId: string;
    toolName: string;
    requestArgsString: string; // Raw arguments string from LLM
    parsedArgs?: any | null;   // Arguments after JSON parsing
    status: ToolCallStatus;
    result?: any | null;       // Result from execute() - included based on option
    error?: {
        type: string;          // ErrorCode enum value
        message: string;
        details?: any;
    } | null;
    resultString: string;      // The final string content sent back to the LLM (JSON result or JSON error)
    durationMs?: number;
}

// Represents the outcome of processing a single tool call internally
export interface ToolCallOutcome {
    message: Message;          // The 'tool' role message to send back to LLM
    details: ToolCallDetail;   // The detailed report for this call
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
  rateLimit?: RateLimit; // Base RateLimit type here
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
  rateLimit?: RateLimit; // Base RateLimit type here
  allowedApiKeys?: string[];
}

export interface RoleConfig {
  allowedTools?: string | string[] | '*';
  rateLimits?: Record<string, RateLimit>; // Base RateLimit type here
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
  // Note: Extended SecurityConfig is defined in security/types.ts
}

// --- Event Types ---

export interface ToolCallEvent {
  toolName: string;
  userId: string; // Can be 'anonymous'
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
  apiBaseUrl?: string;
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
  historyAdapter?: IHistoryStorage;
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
  security?: SecurityConfig; // Base SecurityConfig type here

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
  includeToolResultInReport?: boolean;

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
  toolCalls?: ToolCallDetail[];
  finishReason: string | null;
  durationMs: number;
  id?: string;
  cost?: number | null;
  reasoning?: string | null;
  annotations?: UrlCitationAnnotation[];
}

export interface CreditBalance {
    total_credits: number;
    total_usage: number;
}

export interface ApiKeyInfo {
    data: {
        limit: number;
        usage: number;
        is_free_tier: boolean;
        rate_limit: {
            requests: number;
            interval: string;
        };
    };
}