// Path: src/types/index.ts
import type { AxiosRequestConfig } from 'axios';
import type { ISecurityManager } from '../security/types';
import type { Logger } from '../utils/logger'; // Import Logger type

// --- Core Message and Tool Types ---

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  role: Role;
  content: string | null; // Content can be explicitly null
  timestamp?: string; // Optional timestamp (ISO 8601 UTC)
  name?: string; // Optional name (e.g., for tool role)
  tool_call_id?: string; // ID for tool response message
  tool_calls?: ToolCall[]; // Array of tool calls requested by assistant
}

export interface ToolCall {
  id: string; // Unique ID for the tool call
  type: 'function';
  function: {
    name: string; // Name of the function to call
    arguments: string; // Stringified JSON arguments
  };
}

// --- Tool Definition ---

export interface ToolContext {
  userInfo?: UserAuthInfo; // User info if authenticated
  securityManager?: ISecurityManager; // SecurityManager instance if available
  extraData?: Record<string, unknown>; // For custom data passing
}

// Represents a tool (currently only function type supported)
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string; // Description for the LLM
    parameters?: Record<string, any>; // JSON Schema for arguments
    execute?: (args: any, context?: ToolContext) => Promise<any> | any; // Optional execute here (legacy?)
    security?: ToolSecurity; // Optional security config here (legacy?)
  };
  // Preferred location for execute and security
  execute?: (args: any, context?: ToolContext) => Promise<any> | any; // The function to run
  security?: ToolSecurity; // Tool-specific security config
  // Name might exist at top level for simplified format
  name?: string;
}

// --- Security Related Types (Base definitions used across library) ---

export interface RateLimit {
  limit: number; // Max requests
  period: 'second' | 'minute' | 'hour' | 'day'; // Time window unit
  interval?: string | number; // Alternative: specific interval (e.g., '30s', 60) - takes precedence over period if set
  _source?: string; // Internal: where the limit was defined
}

export interface DangerousArgumentsConfig {
  globalPatterns?: Array<string | RegExp>; // Patterns applied to all tools
  toolSpecificPatterns?: Record<string, Array<string | RegExp>>; // Patterns per tool name
  blockedValues?: string[]; // Disallowed substrings in arguments
  extendablePatterns?: Array<string | RegExp>; // User-added global patterns
  auditOnlyMode?: boolean; // Log dangerous args but don't block?
  specificKeyRules?: Record<string, any>; // Future: rules for specific argument keys
}

export interface ToolSecurity {
  requiredRole?: string | string[]; // Required role(s) to execute
  requiredScopes?: string | string[]; // Required scope(s)/permission(s)
  rateLimit?: RateLimit; // Specific rate limit for this tool
}

export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom'; // Authentication method
  jwtSecret?: string; // Secret for JWT
  // Function to validate a custom token/API key
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null;
}

export interface UserAuthInfo {
  userId: string; // Mandatory user identifier
  role?: string; // Primary role for simple ACL
  scopes?: string[]; // Specific permissions/scopes
  expiresAt?: number; // Token expiration timestamp (ms)
  apiKey?: string; // API key associated with user
  // Optional additional fields often found in JWTs
  username?: string;
  roles?: string[]; // Multiple roles support
  permissions?: string[]; // Alias for scopes?
  metadata?: Record<string, any>; // Custom metadata
  [key: string]: any; // Allow other properties
}

export interface ToolAccessConfig {
  allow?: boolean; // Explicit allow/deny for this tool
  roles?: string | string[]; // Roles allowed access
  scopes?: string | string[]; // Scopes allowed access
  rateLimit?: RateLimit; // Rate limit for this tool (overrides role/global)
  allowedApiKeys?: string[]; // Specific API keys allowed
}

export interface RoleConfig {
  allowedTools?: string | string[]; // Tools allowed for this role ('*' for all)
  rateLimits?: Record<string, RateLimit>; // Rate limits per tool (or '*') for this role
}

export interface RolesConfig {
  roles?: Record<string, RoleConfig>; // Definition of roles
}

// Main security configuration structure
export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all'; // Default access if no rule matches
  userAuthentication?: UserAuthConfig; // How users are authenticated
  toolAccess?: Record<string, ToolAccessConfig>; // Access rules per tool name
  roles?: RolesConfig; // Role definitions
  requireAuthentication?: boolean; // Must users be authenticated for tool calls?
  debug?: boolean; // Enable security debug logs
  allowUnauthenticatedAccess?: boolean; // Allow tool calls without token (if requireAuthentication=false and tool allows)
  dangerousArguments?: DangerousArgumentsConfig; // Argument sanitization config
  // Legacy field, prefer dangerousArguments.toolSpecificPatterns
  toolConfig?: Record<string, {
      dangerousPatterns?: Array<string | RegExp>;
  }>;
}

// --- Event Types ---

export interface ToolCallEvent {
  toolName: string;
  userId: string; // ID of the user initiating the call (or 'anonymous')
  args: any; // Parsed arguments passed to the tool
  result: any; // Result returned by the tool's execute function
  success: boolean; // Did the execute function complete without throwing?
  error?: Error; // Error object if success is false
  timestamp: number; // When the tool call started (ms)
}

// --- History Types ---

export type HistoryStorageType = 'memory' | 'disk';

export interface ChatHistory {
  messages: Message[]; // The sequence of messages
  lastAccess: number; // Timestamp of last access/modification (ms)
  created: number; // Timestamp of creation (ms)
}

export interface HistoryManagerOptions {
  storageType?: HistoryStorageType; // 'memory' or 'disk'
  chatsFolder?: string; // Folder path for 'disk' storage
  maxHistoryEntries?: number; // Max number of *messages* to keep
  debug?: boolean; // Enable history debug logs
  ttl?: number; // Time-to-live for history entries (ms)
  cleanupInterval?: number; // How often to check for expired entries (ms)
  autoSaveOnExit?: boolean; // Save 'disk' history on process exit?
  logger?: Logger; // Pass logger instance
}

// --- API Interaction Types ---

export interface ResponseFormat {
  type: 'json_object' | 'json_schema'; // Type of structured response required
  json_schema?: { // Details required only for 'json_schema' type
    name: string; // Name for the schema
    strict?: boolean; // Whether to use strict schema validation (if supported by model)
    schema: Record<string, any>; // The JSON Schema object
    description?: string; // Optional description of the schema
  };
   description?: string; // Top-level description (less common)
}

// Placeholder for provider-specific preferences
export type ProviderPreferences = Record<string, any>;

// --- Model Pricing Info ---
export interface ModelPricingInfo {
    promptCostPerMillion: number; // Cost per 1 million prompt tokens (in USD)
    completionCostPerMillion: number; // Cost per 1 million completion tokens (in USD)
    // Add other relevant fields from the /models endpoint if needed
    id: string;
    name?: string;
    context_length?: number;
}

// --- Main Client Configuration and Request Options ---

export interface OpenRouterConfig {
  apiKey: string; // REQUIRED: Your OpenRouter API key
  apiEndpoint?: string; // Optional: Override API endpoint URL
  model?: string; // Optional: Default model to use
  debug?: boolean; // Optional: Enable detailed logging
  proxy?: string | { // Optional: Proxy configuration
    host: string;
    port: number | string; // Port can be number or string
    user?: string;
    pass?: string;
  };
  referer?: string; // Optional: HTTP-Referer header (for tracking)
  title?: string; // Optional: X-Title header (for tracking)
  historyStorage?: HistoryStorageType; // Optional: History storage type
  historyAutoSave?: boolean; // Optional: Auto-save history on exit ('disk' only)
  historyTtl?: number; // Optional: History entry TTL (ms)
  historyCleanupInterval?: number; // Optional: History cleanup interval (ms)
  maxHistoryEntries?: number; // Optional: Max *messages* in history
  chatsFolder?: string; // Optional: Folder for 'disk' history
  providerPreferences?: ProviderPreferences; // Optional: Provider-specific settings
  modelFallbacks?: string[]; // Optional: Fallback models to try on error
  enableReasoning?: boolean; // Optional: (Specific feature, may not be standard)
  webSearch?: boolean; // Optional: (Specific feature, may not be standard)
  responseFormat?: ResponseFormat; // Optional: Default response format
  security?: SecurityConfig; // Optional: Security module configuration
  strictJsonParsing?: boolean; // Optional: Throw error on invalid JSON response? (default: false, returns null)
  axiosConfig?: AxiosRequestConfig; // Optional: Pass custom config to Axios
  maxToolCalls?: number; // Optional: Default maximum tool calls per chat()

  // Cost Tracking Options
  enableCostTracking?: boolean; // Optional: Enable cost calculation (default: false)
  priceRefreshIntervalMs?: number; // Optional: How often to refresh model prices (default: 6 hours)
  initialModelPrices?: Record<string, ModelPricingInfo>; // Optional: Provide initial prices to avoid first fetch
}

export interface OpenRouterRequestOptions {
  // Core request data
  prompt?: string; // User's prompt (use this OR customMessages)
  customMessages?: Message[] | null; // Provide full message history instead of prompt

  // Context and History
  user?: string; // User ID for history tracking
  group?: string | null; // Optional Group ID for history tracking
  systemPrompt?: string | null; // System message (ignored if customMessages has system role)
  accessToken?: string | null; // Access token for security checks

  // Model and Generation Parameters
  model?: string; // Override default model for this request
  temperature?: number; // Sampling temperature (0.0-2.0)
  maxTokens?: number | null; // Max tokens in response
  topP?: number | null; // Nucleus sampling probability
  presencePenalty?: number | null; // Penalty for new tokens based on presence
  frequencyPenalty?: number | null; // Penalty for new tokens based on frequency
  stop?: string | string[] | null; // Stop sequence(s)
  seed?: number | null; // Seed for deterministic results (if supported)
  logitBias?: Record<string, number> | null; // Adjust likelihood of specific tokens

  // Tool / Function Calling
  tools?: Tool[] | null; // Available tools for the model to call
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null; // Control tool usage
  parallelToolCalls?: boolean; // Allow model to request multiple tool calls simultaneously (default: true if tools provided)
  maxToolCalls?: number; // Optional: Override max tool calls for this request

  // Response Formatting
  responseFormat?: ResponseFormat | null; // Request specific JSON format
  strictJsonParsing?: boolean; // Override client's strict JSON parsing for this request

  // Routing and Transforms (OpenRouter Specific)
  route?: string; // Specify routing method
  transforms?: string[]; // Apply content transformations

  // Streaming (Not fully implemented yet)
  stream?: boolean; // Request streaming response (currently ignored)
}

// --- API Response Structure ---

export interface UsageInfo {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface OpenRouterResponse {
  id: string; // Request ID
  object: string; // Object type (e.g., 'chat.completion')
  created: number; // Timestamp of creation (Unix seconds)
  model: string; // Model used for the response
  choices: Array<{ // Array of response choices (usually 1)
    index: number;
    message: Message; // The assistant's response message (incl. content, tool_calls)
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null; // Why generation stopped
    logprobs?: any | null; // Log probabilities (if requested)
  }>;
  usage?: UsageInfo; // Token usage information
  system_fingerprint?: string; // System fingerprint (identifies backend configuration)
  // Error object embedded in the response body (alternative to HTTP status error)
  error?: { message?: string; type?: string; [key: string]: any } | string | undefined;
}

// --- Chat Completion Result ---
export interface ChatCompletionResult {
  content: any; // The final processed response content
  usage: UsageInfo | null; // Cumulative token usage for the entire chat call
  model: string; // The model that generated the final response
  toolCallsCount: number; // Total number of tool calls made
  finishReason: string | null; // Finish reason of the final response
  durationMs: number; // Total execution time for the chat() call
  id?: string; // ID of the final completion request
  cost?: number | null; // Calculated cost for the chat call (USD)
}

// --- Credit Balance Info ---
export interface CreditBalance {
    limit: number; // Credit limit (e.g., 100.00)
    usage: number; // Current usage (e.g., 12.34)
}

export {};