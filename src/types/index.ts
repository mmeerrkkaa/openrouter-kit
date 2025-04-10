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
    rawResponse?: any; // Keep raw response if needed by middleware
    error?: any; // Store potential errors
  };
  metadata?: Record<string, any>; // For middleware communication
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
  destroy?: () => Promise<void> | void; // Optional cleanup method
}

// --- Core Message and Tool Types ---

export type Role = 'user' | 'assistant' | 'system' | 'tool';

// Represents a single message in a conversation
export interface Message {
  role: Role;
  content: string | null; // API requires null if content is absent
  timestamp?: string; // Optional: Added by the library for rendering/logging
  name?: string; // Optional: Used for tool function names or participant names
  tool_call_id?: string; // Optional: ID for tool response message
  tool_calls?: ToolCall[]; // Optional: For assistant message requesting tool calls
  reasoning?: string | null; // Optional: Reasoning steps from the model
  annotations?: UrlCitationAnnotation[]; // Optional: Web search citations
}

// Represents a tool call requested by the assistant
export interface ToolCall {
  id: string; // Unique ID for the tool call
  type: 'function'; // Currently only 'function' is supported
  function: {
    name: string; // Name of the function to call
    arguments: string; // JSON string arguments for the function
  };
}

// --- Tool Definition ---

// Context passed to the tool's execute function
export interface ToolContext {
  userInfo?: UserAuthInfo; // User info if authenticated
  securityManager?: ISecurityManager; // Access to security checks
  logger?: Logger; // Scoped logger instance
}

// Defines a tool that the model can use
export interface Tool {
  type: 'function'; // Currently only 'function' is supported
  function: {
    name: string; // Function name
    description?: string; // Description for the model
    parameters?: Record<string, any>; // JSON Schema for arguments
  };
  // The actual function implementation
  execute: (args: any, context?: ToolContext) => Promise<any> | any;
  security?: ToolSecurity; // Optional security rules for this tool
  name?: string; // Optional top-level name (alternative to function.name)
}

// --- Security Related Types (Base definitions) ---

// Defines rate limiting parameters
export interface RateLimit {
  limit: number; // Max requests allowed
  period: 'second' | 'minute' | 'hour' | 'day'; // Time window unit
  // Note: 'interval' (string | number) is defined in the extended type in security/types
}

// Configuration for dangerous argument detection
export interface DangerousArgumentsConfig {
  globalPatterns?: Array<string | RegExp>; // Patterns applied to all tools
  toolSpecificPatterns?: Record<string, Array<string | RegExp>>; // Patterns for specific tools
  blockedValues?: string[]; // Specific string values to block
  // Note: 'extendablePatterns', 'auditOnlyMode', 'specificKeyRules' are in extended type
}

// Security rules specific to a tool definition
export interface ToolSecurity {
  requiredRole?: string | string[]; // Roles required to use the tool
  requiredScopes?: string | string[]; // Scopes/permissions required
  rateLimit?: RateLimit; // Specific rate limit for this tool (uses base RateLimit)
}

// Configuration for user authentication methods
export interface UserAuthConfig {
  type?: 'jwt' | 'api-key' | 'custom'; // Authentication method
  jwtSecret?: string; // Secret for JWT validation/signing
  // Custom validation function
  customAuthenticator?: (token: string) => Promise<UserAuthInfo | null> | UserAuthInfo | null;
}

// Basic user information structure
export interface UserAuthInfo {
  userId: string; // Unique user identifier
  role?: string; // Primary role
  scopes?: string[]; // Permissions/scopes
  expiresAt?: number; // Token expiration timestamp (ms)
  apiKey?: string; // API key associated with the user (if applicable)
  [key: string]: any; // Allow extension for custom fields (like in ExtendedUserAuthInfo)
}

// Access control configuration for specific tools or globally
export interface ToolAccessConfig {
  allow?: boolean; // Explicitly allow/deny access
  roles?: string | string[]; // Roles allowed access
  scopes?: string | string[]; // Scopes required for access
  rateLimit?: RateLimit; // Rate limit for this tool access rule (uses base RateLimit)
  allowedApiKeys?: string[]; // Specific API keys allowed access
}

// Configuration for a specific role
export interface RoleConfig {
  allowedTools?: string | string[] | '*'; // Tools allowed for this role ('*' for all)
  rateLimits?: Record<string, RateLimit>; // Rate limits per tool for this role (uses base RateLimit)
}

// Container for role definitions
export interface RolesConfig {
  roles?: Record<string, RoleConfig>; // Map role names to their configurations
}

// Base Security configuration structure for the client
export interface SecurityConfig {
  defaultPolicy?: 'allow-all' | 'deny-all'; // Default access policy if no rule matches
  userAuthentication?: UserAuthConfig; // Authentication settings
  toolAccess?: Record<string, ToolAccessConfig>; // Tool-specific access rules
  roles?: RolesConfig; // Role definitions
  requireAuthentication?: boolean; // If true, requests without valid auth fail
  // Note: Extended fields ('debug', 'allowUnauthenticatedAccess', 'dangerousArguments', 'toolConfig')
  // are defined in the extended type in security/types
}

// --- Event Types ---

// Basic event structure for tool calls (can be extended)
export interface ToolCallEvent {
  toolName: string;
  userId: string; // Or 'anonymous'
  args: any;
  result: any;
  success: boolean;
  error?: Error;
  timestamp: number; // Start time
}

// --- History Types (Legacy - For reference) ---

/** @deprecated Use IHistoryStorage interface instead */
export type HistoryStorageType = 'memory' | 'disk';

// --- API Interaction Types ---

// Defines the desired format for the API response
export interface ResponseFormat {
  type: 'json_object' | 'json_schema'; // Type of format enforcement
  json_schema?: {
    name: string; // Name for the schema (required for type 'json_schema')
    strict?: boolean; // Whether the model should strictly adhere (if supported)
    schema: Record<string, any>; // The JSON Schema object
    description?: string; // Optional description for the schema
  };
}

// Configuration for routing requests to specific providers
export interface ProviderRoutingConfig {
  order?: string[]; // List of provider names to try in order
  allow_fallbacks?: boolean; // Allow backup providers if ordered ones fail (default: true)
  require_parameters?: boolean; // Only use providers supporting all request parameters (default: false)
  data_collection?: 'allow' | 'deny'; // Filter providers based on data policies (default: 'allow')
  ignore?: string[]; // List of provider names to skip
  quantizations?: string[]; // Filter providers by quantization level (e.g., ["int4", "fp8"])
  sort?: 'price' | 'throughput' | 'latency'; // Explicitly sort providers
}

// Configuration for web search plugin
export interface PluginConfig {
    id: string; // e.g., 'web'
    max_results?: number; // For web search
    search_prompt?: string; // For web search
    [key: string]: any; // Allow other plugin-specific options
}

// Configuration for reasoning tokens
export interface ReasoningConfig {
    effort?: 'low' | 'medium' | 'high'; // OpenAI style effort level
    max_tokens?: number; // Anthropic style token budget
    exclude?: boolean; // Whether to exclude reasoning from the response
}

// Pricing information for a model
export interface ModelPricingInfo {
    id: string; // Model ID
    name?: string; // Model display name
    promptCostPerMillion: number; // Cost per million prompt tokens (USD)
    completionCostPerMillion: number; // Cost per million completion tokens (USD)
    context_length?: number; // Max context length
}

// Structure for URL citation annotations from web search
export interface UrlCitationAnnotation {
    type: 'url_citation';
    url_citation: {
      url: string;
      title: string;
      content?: string; // Content snippet
      start_index: number; // Start index in message content
      end_index: number; // End index in message content
    };
}

// --- Main Client Configuration and Request Options ---

// Configuration object for initializing the OpenRouterClient
export interface OpenRouterConfig {
  // Core
  apiKey: string; // Required: Your OpenRouter API key
  apiEndpoint?: string; // Optional: Override API endpoint URL
  model?: string; // Optional: Default model ID
  debug?: boolean; // Optional: Enable debug logging (default: false)

  // Network & Headers
  proxy?: string | { // Optional: Proxy configuration
    host: string;
    port: number | string;
    user?: string;
    pass?: string;
  };
  referer?: string; // Optional: HTTP-Referer header value
  title?: string; // Optional: X-Title header value
  axiosConfig?: AxiosRequestConfig; // Optional: Custom Axios config

  // History Management
  historyAdapter?: IHistoryStorage; // Recommended: Custom history storage implementation
  historyTtl?: number; // Optional: Cache TTL for history entries (ms)
  historyCleanupInterval?: number; // Optional: Interval for cache cleanup (ms)
  /** @deprecated Use historyAdapter */
  historyStorage?: HistoryStorageType;
  /** @deprecated Configure path in DiskHistoryStorage adapter */
  chatsFolder?: string;
  /** @deprecated Limit handling depends on history adapter/manager */
  maxHistoryEntries?: number;
  /** @deprecated Auto-saving depends on history adapter */
  historyAutoSave?: boolean;

  // Model Behavior & Routing
  defaultProviderRouting?: ProviderRoutingConfig; // Optional: Default provider routing rules
  modelFallbacks?: string[]; // Optional: Default fallback model IDs
  responseFormat?: ResponseFormat | null; // Optional: Default response format
  maxToolCalls?: number; // Optional: Default max recursive tool calls (default: 10)
  strictJsonParsing?: boolean; // Optional: Throw error if JSON response fails parsing/validation (default: false)

  // Security
  security?: SecurityConfig; // Optional: Security configuration (uses base type)

  // Cost Tracking
  enableCostTracking?: boolean; // Optional: Enable cost calculation (default: false)
  priceRefreshIntervalMs?: number; // Optional: How often to refresh prices (ms, default: 6 hours)
  initialModelPrices?: Record<string, ModelPricingInfo>; // Optional: Pre-populate prices

  // Deprecated/Unused?
  enableReasoning?: boolean; // Not standard OpenRouter param
  webSearch?: boolean; // Not standard OpenRouter param, use :online suffix or plugins
}

// Options for a single chat request using client.chat()
export interface OpenRouterRequestOptions {
  // Input Content (prompt or customMessages is required)
  prompt?: string; // Simple user prompt
  customMessages?: Message[] | null; // Full message history override

  // Context & History
  user?: string; // User ID for history tracking
  group?: string | null; // Group ID for history tracking
  systemPrompt?: string | null; // System message content
  accessToken?: string | null; // Access token for security checks

  // Model & Generation Parameters
  model?: string; // Override default model
  temperature?: number; // Sampling temperature (0.0-2.0)
  maxTokens?: number | null; // Max completion tokens
  topP?: number | null; // Nucleus sampling (0.0-1.0)
  presencePenalty?: number | null; // Penalty for new tokens (-2.0-2.0)
  frequencyPenalty?: number | null; // Penalty based on frequency (-2.0-2.0)
  stop?: string | string[] | null; // Stop sequences
  seed?: number | null; // Seed for deterministic sampling (if supported)
  logitBias?: Record<string, number> | null; // Adjust token probabilities

  // Tool / Function Calling
  tools?: Tool[] | null; // Available tools
  toolChoice?: "none" | "auto" | { type: "function", function: { name: string } } | null; // Control tool usage
  parallelToolCalls?: boolean; // Allow model to request multiple tools concurrently (default: true if tools provided)
  maxToolCalls?: number; // Override default max recursive tool calls

  // Response Formatting
  responseFormat?: ResponseFormat | null; // Request specific response format
  strictJsonParsing?: boolean; // Override default strict JSON parsing

  // Routing and Transforms (OpenRouter Specific)
  route?: string; // Deprecated? Use provider routing
  transforms?: string[]; // e.g., ["middle-out"]
  provider?: ProviderRoutingConfig; // Request-specific provider routing rules
  models?: string[]; // Request-specific model list (primary + fallbacks)
  plugins?: PluginConfig[]; // Request-specific plugins (e.g., web search)
  reasoning?: ReasoningConfig; // Request-specific reasoning control
}

// --- API Response Structures ---

// Usage information returned by the API
export interface UsageInfo {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    [key: string]: any; // Allow for provider-specific usage fields
}

// Structure of the main response object from the /chat/completions endpoint
export interface OpenRouterResponse {
  id: string; // Unique generation ID
  object: string; // Typically "chat.completion" or "chat.completion.chunk"
  created: number; // Unix timestamp
  model: string; // Model ID that generated the response
  choices: Array<{
    index: number;
    message: Message; // The generated message (contains content, role, tool_calls etc.)
    // Normalized finish reason: 'stop', 'length', 'tool_calls', 'content_filter', or null
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    logprobs?: any | null; // Optional log probabilities
  }>;
  usage?: UsageInfo; // Optional: Token usage information
  system_fingerprint?: string; // Optional: System fingerprint
  // Optional: Error details if an error occurred during generation
  error?: { message?: string; type?: string; code?: string; [key: string]: any } | string;
}

// Final result object returned by client.chat()
export interface ChatCompletionResult {
  content: any; // Parsed final content (string, object, etc.)
  usage: UsageInfo | null; // Total usage for the request chain
  model: string; // Final model used
  toolCallsCount: number; // Total number of tool calls made
  finishReason: string | null; // Final finish reason
  durationMs: number; // Total duration of the chat request
  id?: string; // ID of the final generation step
  cost?: number | null; // Calculated cost (if enabled)
  reasoning?: string | null; // Reasoning steps from the final response
  annotations?: UrlCitationAnnotation[]; // Web search citations from the final response
}

// Structure for credit balance information from /auth/key
export interface CreditBalance {
    limit: number; // Total credits purchased or limit
    usage: number; // Credits used
}

// Export an empty object to satisfy TypeScript's module requirements if needed
export {};