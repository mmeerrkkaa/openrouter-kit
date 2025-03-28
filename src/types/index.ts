// Path: types/index.ts
import type { AxiosRequestConfig } from 'axios';
import type {
    ISecurityManager,
    SecurityConfig as ExtendedSecurityConfig, // This name is potentially confusing, rename or use BaseSecurityConfig
    UserAuthInfo as ExtendedUserAuthInfo, // Rename or use BaseUserAuthInfo
    ExtendedRateLimit, // Import the one with interval
    DangerousArgumentsConfig as ExtendedDangerousArgumentsConfig // Import extended one
} from '../security/types';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  role: Role;
  content: string | null;
  timestamp?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolContext {
  userInfo?: UserAuthInfo; // Use the local UserAuthInfo definition
  securityManager?: ISecurityManager;
  extraData?: Record<string, unknown>;
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    execute?: (args: any, context?: ToolContext) => Promise<any> | any;
    security?: ToolSecurity; // Use local ToolSecurity
  };
  execute?: (args: any, context?: ToolContext) => Promise<any> | any;
  security?: ToolSecurity; // Use local ToolSecurity
  name?: string;
}

// Define the base RateLimit here, including the optional interval
export interface RateLimit {
  limit: number;
  period: 'second' | 'minute' | 'hour' | 'day';
  interval?: string | number; // Include interval here as optional
   _source?: string;
}

// Define the base DangerousArgumentsConfig here
export interface DangerousArgumentsConfig {
  globalPatterns?: RegExp[];
  toolSpecificPatterns?: Record<string, RegExp[]>;
  blockedValues?: string[];
  extendablePatterns?: Array<string | RegExp>;
  auditOnlyMode?: boolean;
  specificKeyRules?: Record<string, any>; // Add the missing property
}

export interface ToolSecurity {
  requiredRole?: string | string[];
  requiredScopes?: string | string[];
  rateLimit?: RateLimit; // Uses local RateLimit definition
}

// Define the base SecurityConfig here
export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all';
  userAuthentication?: UserAuthConfig; // Use local UserAuthConfig
  toolAccess?: Record<string, ToolAccessConfig>; // Use local ToolAccessConfig
  roles?: RolesConfig; // Use local RolesConfig
  requireAuthentication?: boolean;
  debug?: boolean;
  allowUnauthenticatedAccess?: boolean;
  dangerousArguments?: DangerousArgumentsConfig; // Use local DangerousArgumentsConfig
  toolConfig?: Record<string, { // legacy field
      dangerousPatterns?: Array<string | RegExp>;
  }>;
}

export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom';
  jwtSecret?: string;
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null; // Use local UserAuthInfo
}

// Define the base UserAuthInfo here
export interface UserAuthInfo {
  userId: string;
  role?: string;
  scopes?: string[];
  expiresAt?: number;
  apiKey?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ToolAccessConfig {
  allow?: boolean;
  roles?: string | string[];
  scopes?: string | string[];
  rateLimit?: RateLimit; // Use local RateLimit
  allowedApiKeys?: string[];
}

export interface RolesConfig {
  roles?: Record<string, RoleConfig>; // Use local RoleConfig
}

export interface RoleConfig {
  allowedTools?: string | string[];
  rateLimits?: Record<string, RateLimit>; // Use local RateLimit
}

export interface ToolCallEvent {
  toolName: string;
  userId: string;
  args: any;
  result: any;
  success: boolean;
  error?: Error;
  timestamp: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ResponseFormat {
  type: 'json_object' | 'json_schema';
  json_schema?: {
    name: string;
    strict?: boolean;
    schema: Record<string, any>;
  };
   description?: string;
}

export type ProviderPreferences = Record<string, any>;

export type HistoryStorageType = 'memory' | 'disk';

export interface HistoryManagerOptions {
  chatsFolder?: string;
  maxHistoryEntries?: number;
  storageType?: HistoryStorageType;
  debug?: boolean;
  ttl?: number;
  cleanupInterval?: number;
  autoSaveOnExit?: boolean;
}

export interface OpenRouterConfig {
  apiKey: string;
  apiEndpoint?: string;
  model?: string;
  debug?: boolean;
  proxy?: string | {
    host: string;
    port: number | string;
    user?: string;
    pass?: string;
  };
  referer?: string;
  title?: string;
  historyStorage?: HistoryStorageType;
  historyAutoSave?: boolean;
  historyTtl?: number;
  historyCleanupInterval?: number;
  providerPreferences?: ProviderPreferences;
  modelFallbacks?: string[];
  enableReasoning?: boolean;
  webSearch?: boolean;
  responseFormat?: ResponseFormat;
  security?: SecurityConfig; // Uses local SecurityConfig
  strictJsonParsing?: boolean;
  axiosConfig?: AxiosRequestConfig;
}

export interface OpenRouterRequestOptions {
  user?: string;
  group?: string | null;
  prompt?: string;
  systemPrompt?: string | null;
  tools?: Tool[] | null; // Uses local Tool
  responseFormat?: ResponseFormat | null;
  temperature?: number;
  maxTokens?: number | null;
  customMessages?: Message[] | null;
  accessToken?: string | null;
  topP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  stop?: string | string[] | null;
  logitBias?: Record<string, number> | null;
  seed?: number | null;
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null;
  parallelToolCalls?: boolean;
  route?: string;
  transforms?: string[];
  strictJsonParsing?: boolean;
  stream?: boolean;
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
  error?: { message?: string; type?: string; [key: string]: any } | string | undefined;
}

export interface ChatHistory {
  messages: Message[];
  lastAccess: number;
  created: number;
}

export {};