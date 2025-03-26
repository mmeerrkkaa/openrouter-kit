// Path: types/index.ts
/**
 * Core data types and interfaces for the OpenRouter Client library.
 */

import type { AxiosRequestConfig } from 'axios';
// Import ISecurityManager and other types from security/types
import type {
    ISecurityManager, // Now imported from here
    SecurityConfig as ExtendedSecurityConfig, // Still needed for extension
    UserAuthInfo as ExtendedUserAuthInfo     // Still needed for extension
} from '../security/types';

/**
 * Role of the participant in the dialogue.
 */
export type Role = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Represents a single message in the dialogue.
 */
export interface Message {
  role: Role;
  content: string | null; // Content can be null (e.g., for tool calls)
  timestamp?: string;     // Optional timestamp for rendering/logging
  name?: string;          // Optional name (e.g., for function/tool name)
  tool_call_id?: string;  // ID for relating tool response messages
  tool_calls?: ToolCall[];// Array of tool calls requested by the assistant
}

/**
 * Context passed to the `execute` function of a tool (`Tool.execute`).
 */
export interface ToolContext {
  userInfo?: UserAuthInfo; // Uses the base UserAuthInfo type
  securityManager?: ISecurityManager; // Refers to the imported ISecurityManager
  extraData?: Record<string, unknown>; // For passing arbitrary additional data
}

/**
 * Definition of a tool (function) available for the LLM model to call.
 */
export interface Tool {
  type: 'function'; // Currently only 'function' type is supported
  function: {
    name: string;                   // The name of the function to be called
    description?: string;           // Description of what the function does
    parameters?: Record<string, any>; // JSON Schema object describing function parameters
    /** @deprecated Use execute on the top level */
    execute?: (args: any, context?: ToolContext) => Promise<any> | any;
    /** @deprecated Use security on the top level */
    security?: ToolSecurity;
  };
  // The actual function to execute when the tool is called
  execute?: (args: any, context?: ToolContext) => Promise<any> | any;
  // Security settings specific to this tool
  security?: ToolSecurity;
  /** @deprecated Use function.name instead */
   name?: string;
}

/**
 * Base definition of a request rate limit.
 * Extended in `security/types.ts`.
 */
export interface RateLimit {
  limit: number; // Maximum number of requests allowed
  period: 'second' | 'minute' | 'hour' | 'day'; // Time window for the limit
   /** @deprecated Use `ExtendedRateLimit` from `security/types.ts` */
   interval?: string | number;
   /** @deprecated Use `ExtendedRateLimit` from `security/types.ts` */
   maxRequests?: number;
   /** @internal Internal field to track the source of the limit rule */
   _source?: string;
}

/**
 * Configuration for dangerous argument checks (part of `SecurityConfig`).
 * Defined here for the base type, may be extended in `security/types.ts`.
 */
export interface DangerousArgumentsConfig {
  globalPatterns?: RegExp[];         // Global regex patterns to check against arguments
  toolSpecificPatterns?: Record<string, RegExp[]>; // Patterns specific to certain tools
  blockedValues?: string[];        // Substrings that are globally disallowed in arguments
}

/**
 * Security settings for a specific tool (`Tool.security`).
 */
export interface ToolSecurity {
  requiredRole?: string | string[];  // Role(s) required to execute the tool
  requiredScopes?: string | string[]; // Scope(s) or permission(s) required
  rateLimit?: RateLimit;            // Rate limit specific to this tool (refers to base RateLimit)
}

/**
 * Base configuration for the `SecurityManager` module.
 * Extended by the `SecurityConfig` type (intersection) in `security/types.ts`.
 */
export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all'; // Default access policy if no specific rule matches
  userAuthentication?: UserAuthConfig;      // User authentication settings
  toolAccess?: Record<string, ToolAccessConfig>; // Access control settings per tool
  roles?: RolesConfig;                      // Role definitions and associated permissions/limits
  requireAuthentication?: boolean;          // If true, all requests require a valid access token
  // Fields like debug, dangerousArguments, allowUnauthenticatedAccess moved to security/types.ts
}

/**
 * User authentication settings (`SecurityConfig.userAuthentication`).
 */
export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom'; // Authentication method
  jwtSecret?: string;                 // Secret key for JWT validation/signing
  // Custom function to authenticate a user based on a token
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null;
}

/**
 * Base information about an authenticated user.
 * Extended by the `UserAuthInfo` type (intersection) in `security/types.ts`.
 */
export interface UserAuthInfo {
  userId: string;         // Unique identifier for the user
  role?: string;          // User's primary role (used for access control)
  scopes?: string[];      // Permissions or scopes granted to the user
  expiresAt?: number;     // Timestamp (ms) when the authentication expires (e.g., for JWT)
  apiKey?: string;        // API key used for authentication (if applicable)
  [key: string]: any;     // Allows for additional arbitrary properties
}

/**
 * Access settings for a specific tool in `SecurityConfig.toolAccess`.
 */
export interface ToolAccessConfig {
  allow?: boolean;            // Explicitly allow or deny access
  roles?: string | string[];  // Role(s) that are allowed/denied access
  scopes?: string | string[]; // Scope(s) required for access
  rateLimit?: RateLimit;      // Rate limit specific to this tool (refers to base RateLimit)
  allowedApiKeys?: string[];  // Specific API keys allowed to access this tool
}

/**
 * User role settings in `SecurityConfig.roles`.
 */
export interface RolesConfig {
  roles?: Record<string, RoleConfig>; // Map of role names to their configurations
}

/**
 * Configuration for a specific user role (`RolesConfig.roles[roleName]`).
 */
export interface RoleConfig {
  allowedTools?: string | string[]; // List of tools allowed for this role ('*' for all)
  rateLimits?: Record<string, RateLimit>; // Rate limits specific to this role, per tool or global ('*')
}

/**
 * Base information about a tool call event.
 * Extended by the `ExtendedToolCallEvent` type in `security/types.ts`.
 */
export interface ToolCallEvent {
  toolName: string; // Name of the tool called
  userId: string;   // ID of the user who initiated the call (or 'unknown')
  args: any;        // Arguments passed to the tool
  result: any;      // Result returned by the tool execution
  success: boolean; // Whether the tool execution was successful
  error?: Error;    // Error object if execution failed
  timestamp: number;// Timestamp (ms) when the call started
  // duration is added in ExtendedToolCallEvent
}

/**
 * Represents a tool call request generated by the LLM.
 */
export interface ToolCall {
  id: string;       // Unique identifier for the tool call instance
  type: 'function'; // Type of the tool call (currently only 'function')
  function: {
    name: string;     // Name of the function the model wants to call
    arguments: string; // JSON string representation of the arguments
  };
}

/**
 * Specifies the format the LLM model should return the response in.
 */
export interface ResponseFormat {
  type: 'json_object' | 'json_schema'; // Type of format constraint
  json_schema?: {
    name: string; // Name for the schema (used by some models)
    strict?: boolean; // Whether the model should strictly adhere (provider-dependent)
    schema: Record<string, any>; // The JSON Schema object itself
  };
   /** @deprecated Not standard, description should be within the schema */
   description?: string;
}

/**
 * Provider preference settings for the OpenRouter API (specific to OpenRouter).
 * Allows influencing which underlying provider serves the request.
 */
export type ProviderPreferences = Record<string, any>;

/**
 * Storage type for the dialogue history manager.
 */
export type HistoryStorageType = 'memory' | 'disk';

/**
 * Options for the `HistoryManager` constructor.
 */
export interface HistoryManagerOptions {
  chatsFolder?: string;          // Folder for saving history files (for 'disk' type)
  maxHistoryEntries?: number;    // Max number of message pairs (user/assistant) to store
  storageType?: HistoryStorageType;// 'memory' or 'disk'
  debug?: boolean;               // Enable debug logging for the history manager
  ttl?: number;                  // Time-to-live for history entries (ms)
  cleanupInterval?: number;      // Interval for checking and cleaning up expired entries (ms)
  autoSaveOnExit?: boolean;      // Whether to save history on process exit (for 'disk' type)
}

/**
 * Configuration for the `OpenRouterClient`.
 */
export interface OpenRouterConfig {
  apiKey: string;               // Your OpenRouter API key (required)
  apiEndpoint?: string;         // OpenRouter API URL. Defaults to the official endpoint.
  model?: string;               // Default model to use for requests.
  debug?: boolean;              // Enable verbose logging mode for the client.
  proxy?: string | {            // Proxy settings (URL string or object).
    host: string;
    port: number | string; // Allow string for port, validated later
    user?: string;
    pass?: string;
  };
  referer?: string;             // HTTP-Referer header (used for OpenRouter leaderboards).
  title?: string;               // X-Title header (used for OpenRouter leaderboards).
  historyStorage?: HistoryStorageType; // History storage type ('memory' or 'disk').
  historyAutoSave?: boolean;    // Auto-save history on exit (for 'disk' storage).
  historyTtl?: number;          // TTL for history entries (ms).
  historyCleanupInterval?: number;// History cleanup interval (ms).
  providerPreferences?: ProviderPreferences; // OpenRouter provider preferences settings.
  modelFallbacks?: string[];    // List of fallback models to try if the primary fails.
  /** @deprecated Reasoning parameters are handled differently now */
  enableReasoning?: boolean;
  /** @deprecated Web search plugin is handled differently now */
  webSearch?: boolean;
  responseFormat?: ResponseFormat;// Default response format for requests.
  /** Refers to the base SecurityConfig */
  security?: SecurityConfig;    // Security configuration object.
  strictJsonParsing?: boolean;  // Enable strict JSON validation in responses. Default is false.
  axiosConfig?: AxiosRequestConfig; // Additional Axios settings to merge.
}

/**
 * Options for a single `client.chat()` method call.
 */
export interface OpenRouterRequestOptions {
  user?: string;                // User ID for managing history.
  group?: string | null;        // Group ID for managing history (optional).
  prompt?: string;              // User prompt text (if `customMessages` are not used).
  systemPrompt?: string | null; // System message (optional).
  tools?: Tool[] | null;        // List of available tools (optional).
  responseFormat?: ResponseFormat | null; // Response format for this specific request.
  temperature?: number;         // Generation temperature (0.0-2.0).
  maxTokens?: number | null;    // Max tokens in the response.
  customMessages?: Message[] | null; // Full list of messages to send (instead of prompt/history).
  accessToken?: string | null;  // User access token (if using SecurityManager).
  topP?: number | null;         // Nucleus sampling parameter (0.0-1.0).
  presencePenalty?: number | null;// Token presence penalty (-2.0-2.0).
  frequencyPenalty?: number | null;// Token frequency penalty (-2.0-2.0).
  stop?: string | string[] | null;// Sequences to stop generation.
  logitBias?: Record<string, number> | null; // Token probability bias map.
  seed?: number | null;         // Seed for reproducibility.
  // Controls how the model selects a tool ('none', 'auto', or specific function).
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null;
  parallelToolCalls?: boolean;  // Allow the model to request multiple tool calls in parallel.
  route?: string;               // Preferred OpenRouter route (e.g., 'fallback').
  transforms?: string[];        // OpenRouter transformations (e.g., 'middle-out').
  strictJsonParsing?: boolean;  // Overrides client's strictJsonParsing setting for this request.
  /** @experimental Streaming is not fully implemented yet */
  stream?: boolean;             // Enable streaming responses.
}

/**
 * Structure of a successful response from the OpenRouter `/chat/completions` API.
 */
export interface OpenRouterResponse {
  id: string;                   // Unique ID for the generation.
  object: string;               // Type of object (e.g., 'chat.completion').
  created: number;              // Unix timestamp (seconds) when the response was created.
  model: string;                // Model used for the generation.
  choices: Array<{              // List of completion choices (usually one).
    index: number;              // Index of the choice.
    message: Message;           // The generated message (role: 'assistant').
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null; // Why generation stopped.
    logprobs?: any | null;      // Log probabilities (if requested).
  }>;
  usage?: {                     // Token usage statistics.
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;  // System fingerprint from the provider (if available).
  // Error object if an error occurred during generation (status code will still be 200).
  error?: { message?: string; type?: string; [key: string]: any } | string | undefined;
}

/**
 * Internal structure for storing chat history in `HistoryManager`.
 * @internal
 */
export interface ChatHistory {
  messages: Message[]; // Array of messages in the chat.
  lastAccess: number;  // Timestamp (ms) of the last access/modification.
  created: number;     // Timestamp (ms) when the history entry was created.
}

/**
 * Reminder about necessary dependencies. (Used to ensure module augmentation works).
 */
export {};