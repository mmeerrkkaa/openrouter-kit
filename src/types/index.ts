import type { AxiosRequestConfig } from 'axios';
// Import ISecurityManager from its correct location
import type { ISecurityManager } from '../security/types'; // Relative path
import type { Logger } from '../utils/logger'; // Relative path

// --- Plugin and Middleware Types ---

export interface OpenRouterPlugin {
  init(client: import('../client').OpenRouterClient): Promise<void> | void;
  destroy?: () => Promise<void> | void;
}

export interface MiddlewareContext {
  request: {
    options: OpenRouterRequestOptions; // Use defined type below
  };
  response?: {
    result?: ChatCompletionResult; // Use defined type below
    rawResponse?: any;
    error?: any;
  };
  metadata?: Record<string, any>;
}

export type MiddlewareFunction = (
    ctx: MiddlewareContext,
    next: () => Promise<void>
) => Promise<void>;

// --- History Storage Adapter Interface ---

export interface IHistoryStorage {
  load(key: string): Promise<Message[]>; // Use defined type below
  save(key: string, messages: Message[]): Promise<void>; // Use defined type below
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
  tool_calls?: ToolCall[]; // Use defined type below
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
  userInfo?: UserAuthInfo; // Use defined type below
  securityManager?: ISecurityManager; // Use imported interface
  logger?: Logger; // Use imported type
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>; // JSON Schema object
  };
  execute: (args: any, context?: ToolContext) => Promise<any> | any; // The implementation
  security?: ToolSecurity; // Use defined type below
  name?: string; // Optional top-level name
}

// --- Security Related Types (Base definitions) ---

export interface RateLimit {
  limit: number;
  period: 'second' | 'minute' | 'hour' | 'day';
  // interval?: string | number; // Defined in extended type in security/types
  // _source?: string; // Internal field defined in extended type
}

export interface DangerousArgumentsConfig {
  globalPatterns?: Array<string | RegExp>;
  toolSpecificPatterns?: Record<string, Array<string | RegExp>>;
  blockedValues?: string[];
  // Other fields are in the extended type in security/types
}

export interface ToolSecurity {
  requiredRole?: string | string[];
  requiredScopes?: string | string[];
  rateLimit?: RateLimit; // Use base RateLimit here
  // dangerousPatterns?: Array<string | RegExp>; // Deprecated
}

export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom';
  jwtSecret?: string;
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null; // Use defined type below
}

export interface UserAuthInfo {
  userId: string;
  role?: string;
  scopes?: string[];
  expiresAt?: number;
  apiKey?: string;
  [key: string]: any; // Allow extension
}

export interface ToolAccessConfig {
  allow?: boolean;
  roles?: string | string[];
  scopes?: string | string[];
  rateLimit?: RateLimit; // Use base RateLimit here
  allowedApiKeys?: string[];
}

export interface RoleConfig {
  allowedTools?: string | string[];
  rateLimits?: Record<string, RateLimit>; // Use base RateLimit here
}

export interface RolesConfig {
  roles?: Record<string, RoleConfig>;
}

// Base Security configuration structure
export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all';
  userAuthentication?: UserAuthConfig;
  toolAccess?: Record<string, ToolAccessConfig>;
  roles?: RolesConfig;
  requireAuthentication?: boolean;
  // Extended fields are defined in security/types
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

// --- History Types (Legacy - For reference or potential external use) ---

/** @deprecated Use IHistoryStorage interface instead */
export type HistoryStorageType = 'memory' | 'disk';

/** @deprecated Internal representation used by legacy HistoryManager */
export interface ChatHistory {
  messages: Message[];
  lastAccess: number;
  created: number;
}

/** @deprecated Options for the legacy HistoryManager */
export interface HistoryManagerOptions {
  storageType?: HistoryStorageType;
  chatsFolder?: string;
  maxHistoryEntries?: number;
  debug?: boolean;
  ttl?: number;
  cleanupInterval?: number;
  autoSaveOnExit?: boolean;
  logger?: Logger;
}

// --- API Interaction Types ---

export interface ResponseFormat {
  type: 'json_object' | 'json_schema';
  json_schema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, any>; // JSON Schema object
    description?: string;
  };
}

export type ProviderPreferences = Record<string, any>;

export interface ModelPricingInfo {
    id: string;
    name?: string;
    promptCostPerMillion: number;
    completionCostPerMillion: number;
    context_length?: number;
}

// --- Main Client Configuration and Request Options ---

export interface OpenRouterConfig {
  // Core
  apiKey: string;
  apiEndpoint?: string;
  model?: string;
  debug?: boolean;

  // Network & Headers
  proxy?: string | {
    host: string;
    port: number | string;
    user?: string;
    pass?: string;
  };
  referer?: string;
  title?: string;
  axiosConfig?: AxiosRequestConfig;

  // History Management
  historyAdapter?: IHistoryStorage; // Preferred way
  historyTtl?: number;
  historyCleanupInterval?: number;
  /** @deprecated */
  historyStorage?: HistoryStorageType;
  /** @deprecated */
  chatsFolder?: string;
   /** @deprecated */
  maxHistoryEntries?: number;
  /** @deprecated */
  historyAutoSave?: boolean;


  // Model Behavior & Routing
  providerPreferences?: ProviderPreferences;
  modelFallbacks?: string[];
  responseFormat?: ResponseFormat | null;
  maxToolCalls?: number;
  strictJsonParsing?: boolean;

  // Security
  security?: SecurityConfig; // Use base SecurityConfig here

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
  tools?: Tool[] | null; // Use base Tool type
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null;
  parallelToolCalls?: boolean;
  maxToolCalls?: number;

  // Response Formatting
  responseFormat?: ResponseFormat | null;
  strictJsonParsing?: boolean;

  // Routing and Transforms (OpenRouter Specific)
  route?: string;
  transforms?: string[];
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
    message: Message; // Use defined Message type
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    logprobs?: any | null;
  }>;
  usage?: UsageInfo; // Use defined UsageInfo type
  system_fingerprint?: string;
  error?: { message?: string; type?: string; code?: string; [key: string]: any } | string;
}

// Final result object returned by client.chat()
export interface ChatCompletionResult {
  content: any;
  usage: UsageInfo | null;
  model: string;
  toolCallsCount: number;
  finishReason: string | null;
  durationMs: number;
  id?: string;
  cost?: number | null;
}

// Structure for credit balance information
export interface CreditBalance {
    limit: number;
    usage: number;
}

export {}; 