# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It significantly simplifies working with LLMs by providing a high-level API for chats, automatic management of conversation history, seamless handling of tool calls (function calling), a robust and configurable security module, and optional request cost tracking. It's ideal for building chatbots, AI agents, and integrating LLMs into your applications.

## Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, and tool handling are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, history storage, security, and much more.
*   **Security:** The built-in security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the core library.
*   **Reliability:** Full TypeScript typings, predictable error handling, and resource management.

## 📚 Table of Contents

*   [🚀 Key Features](#-key-features)
*   [📦 Installation](#-installation)
*   [✨ Basic Usage](#-basic-usage)
*   [🚕 Example: Taxi Bot](#-example-taxi-bot)
*   [⚙️ API and Concepts](#️-api-and-concepts)
    *   [OpenRouterClient](#openrouterclient)
        *   [Configuration (OpenRouterConfig)](#configuration-openrouterconfig)
        *   [Core Methods](#core-methods)
    *   [Plugins and Middleware](#-plugins-and-middleware)
    *   [History Management (Adapters)](#-history-management-adapters)
    *   [Tool Handling (Function Calling)](#-tool-handling-function-calling)
    *   [Security Module (SecurityManager)](#-security-module-securitymanager)
    *   [Cost Tracking](#-cost-tracking)
    *   [Response Format (responseFormat)](#️-response-format-responseformat)
    *   [Error Handling](#️-error-handling)
    *   [Logging](#-logging)
    *   [Proxy](#-proxy)
*   [📄 License](#-license)

## 🚀 Key Features

*   **🤖 Universal Chat:** Simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
    *   Returns a structured `ChatCompletionResult` object containing content (`content`), token usage information (`usage`), model used (`model`), number of tool calls (`toolCallsCount`), finish reason (`finishReason`), execution time (`durationMs`), request ID (`id`), and **calculated cost** (`cost`, optional).
*   **📜 History Management:** Automatic loading, saving, and trimming of conversation history for each user or group.
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Includes built-in adapters for memory (`MemoryHistoryStorage`) and disk (`DiskHistoryStorage`, JSON files).
    *   Easily plug in custom adapters (Redis, MongoDB, API, etc.).
    *   Configurable TTL, limits, and cleanup intervals.
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for model-driven function calls.
    *   Define tools using the `Tool` interface and JSON Schema for argument validation.
    *   Automatic argument parsing, schema validation, and **security checks**.
    *   Execution of your `execute` functions with context (`ToolContext`, including `userInfo`).
    *   Automatic sending of results back to the model to get the final response.
    *   Configurable limit on the maximum number of tool call rounds (`maxToolCalls`) to prevent loops.
*   **🛡️ Security Module:** Comprehensive and configurable protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching) via `AuthManager`. Easily extensible for other methods (`api-key`, `custom`).
    *   **Access Control (ACL):** Flexible configuration of tool access (`AccessControlManager`) based on roles (`roles`), API keys (`allowedApiKeys`), permissions (`scopes`), or explicit rules (`allow`/`deny`). Default policy (`deny-all`/`allow-all`).
    *   **Rate Limiting:** Apply call limits (`RateLimitManager`) to tools for users or roles with configurable periods and limits.
    *   **Argument Sanitization:** Check (`ArgumentSanitizer`) tool arguments for potentially dangerous patterns (SQLi, XSS, command injection, etc.) with global, tool-specific, and custom rules. Supports audit-only mode (`auditOnlyMode`).
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, `token:invalid`, `user:authenticated`, etc.) for monitoring and logging.
*   **📈 Cost Tracking:** (Optional)
    *   Automatic calculation of the approximate cost for each `chat()` call based on token usage data (`usage`) and OpenRouter model prices.
    *   Periodic background updates of model prices from the OpenRouter API (`/models`).
    *   `getCreditBalance()` method to check the current credit balance.
    *   Access cached prices via `getModelPrices()`.
*   **⚙️ Flexible Configuration:** Configure API key, default model, endpoint, timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limit (`maxToolCalls`), cost tracking (`enableCostTracking`), and many other parameters via `OpenRouterConfig`.
*   **💡 Typing:** Fully written in TypeScript, providing strong typing, autocompletion, and type checking during development.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, `ToolError`, `ConfigError`, etc.) inheriting from `OpenRouterError`, with codes (`ErrorCode`) and details for convenient handling. `mapError` function for error normalization.
*   **📝 Logging:** Built-in flexible logger (`Logger`) with prefix support and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API that hides the complexity of interacting with LLMs, history, and tools.
*   **🧹 Resource Management:** `client.destroy()` method for proper resource cleanup (timers, caches, handlers), preventing leaks in long-running applications.
*   **🧩 Plugin System:** Extend client capabilities without modifying the core.
    *   Supports connecting external and custom plugins via `client.use(plugin)`.
    *   Plugins can add middleware, replace managers (history, security, cost), subscribe to events, and extend the client API.
*   **🔗 Middleware Chain:** Flexible request and response processing before and after the API call.
    *   Add middleware functions via `client.useMiddleware(fn)`.
    *   Middleware can modify requests (`ctx.request`), responses (`ctx.response`), implement auditing, access control, logging, cost limiting, caching, and more.

## 📦 Installation

```bash
npm install openrouter-kit
# or
yarn add openrouter-kit
# or
pnpm add openrouter-kit
```

## ✨ Basic Usage

**TypeScript:**

```typescript
import OpenRouter from 'openrouter-kit';
// or for CommonJS: const { OpenRouterClient } = require('openrouter-kit');

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...', // Use environment variables!
  enableCostTracking: true, // Optional: enable cost calculation
  debug: false,             // Optional: enable detailed logs
});

async function main() {
  try {
    console.log('Sending request...');
    const result = await client.chat({ // Get the ChatCompletionResult object
      prompt: 'Say hi to the world!',
      model: 'google/gemini-2.0-flash-001', // Optional: override the model
      user: 'test-user-1', // Optional: for history saving
    });

    console.log('--- Result ---');
    console.log('Model Response:', result.content); // Access content via .content
    console.log('Token Usage:', result.usage);
    console.log('Model Used:', result.model);
    console.log('Tool Calls Made:', result.toolCallsCount);
    console.log('Finish Reason:', result.finishReason);
    console.log('Execution Time (ms):', result.durationMs);
    if (result.cost !== null) {
      console.log('Estimated Cost (USD):', result.cost.toFixed(8));
    }
    console.log('Request ID:', result.id);

    // Example: Get balance (if API key is valid)
    console.log('\nChecking balance...');
    const balance = await client.getCreditBalance();
    console.log(`Credit Balance: Used $${balance.usage.toFixed(4)} out of $${balance.limit.toFixed(2)}`);

    // Example: Get history (if user was specified)
    const historyManager = client.getHistoryManager(); // Get the history manager
    // Ensure it's the UnifiedHistoryManager which has getHistory
    if (historyManager && typeof historyManager.getHistory === 'function') {
        // Key is formed internally, typically like 'user:test-user-1'
        const history = await historyManager.getHistory('user:test-user-1');
        console.log(`\nMessages stored in history for user:test-user-1: ${history.length}`);
    }

  } catch (error: any) {
    // Error handling (see "Error Handling" section)
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) {
        console.error(`Error Code: ${error.code}`);
    }
    if (error.statusCode) {
        console.error(`HTTP Status: ${error.statusCode}`);
    }
    if (error.details) {
        console.error(`Details:`, error.details);
    }
    // console.error(error.stack); // Full stack trace for debugging
  } finally {
    console.log('\nShutting down and releasing resources...');
    // Important: release resources (timers, caches)
    await client.destroy();
    console.log('Resources released.');
  }
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  enableCostTracking: true, // Optional
});

async function main() {
  try {
    const result = await client.chat({ prompt: 'Hello, world!' });
    console.log('Model Response:', result.content);
    console.log('Usage:', result.usage);
    console.log('Cost:', result.cost); // null if enableCostTracking: false
  } catch (error) {
     console.error(`Error: ${error.message}`, error.details || error);
  } finally {
     // Important: release resources
     await client.destroy();
  }
}

main();
```

## 🚕 Example: Taxi Bot

This example demonstrates using conversation history and tool calling (function calling) to create a simple taxi dispatcher bot.

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Example proxy configuration (if needed)
// const proxyConfig = {
//   host: "your.proxy.server",
//   port: 8080, // can be string or number
//   user: "proxy_user", // optional
//   pass: "proxy_pass", // optional
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...", // Replace or use env!
  model: "google/gemini-2.0-flash-001", // Use a fast model
  // Uses default memory adapter (explicitly specifying is not required)
  // historyAdapter: new MemoryHistoryStorage(), // Equivalent to omitting or historyStorage: 'memory'
  // proxy: proxyConfig, // Uncomment if using a proxy
  enableCostTracking: true, // Enable cost calculation
  debug: false, // Set to true for detailed logs
  // Example security settings:
  // security: {
  //   defaultPolicy: 'deny-all', // Deny all tools by default
  //   toolAccess: { // Allow specific tools
  //       'estimateRideCost': { allow: true },
  //       'acceptOrder': { allow: true },
  //   }
  // }
});

let orderAccepted = false; // Flag to end the conversation

// --- Tool Definitions ---
const taxiTools = [
  {
    type: "function",
    function: {
      name: "estimateRideCost",
      description: "Estimates the cost of a taxi ride between two addresses.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Origin address (e.g., '1 Lenin St, Moscow')" },
          to: { type: "string", description: "Destination address (e.g., '10 Tverskaya St, Moscow')" }
        },
        required: ["from", "to"]
      },
    },
    // The function to be executed
    execute: async (args) => {
      console.log(`[Tool estimateRideCost] Calculating cost from ${args.from} to ${args.to}...`);
      // Simulate cost calculation
      const cost = Math.floor(Math.random() * 900) + 100; // Random cost between 100 and 999
      console.log(`[Tool estimateRideCost] Calculated cost: ${cost} RUB`);
      // Important: return data the model can use
      return {
        estimatedCost: cost,
        currency: "RUB"
      };
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Accepts and confirms a taxi order, assigns a driver.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Confirmed origin address" },
          to: { type: "string", description: "Confirmed destination address" },
          // Model might optionally pass the cost if it remembers it
          estimatedCost: { type: "number", description: "Approximate ride cost (if known)"}
        },
        required: ["from", "to"]
      },
    },
    // The function to be executed
    execute: async (args, context) => { // Context is available
      console.log(`[Tool acceptOrder] Accepting order from ${args.from} to ${args.to}...`);
      console.log(`[Tool acceptOrder] Order initiated by user: ${context?.userInfo?.userId || 'anonymous'}`); // Example context usage
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Update flag to finish
      // Return a string for the model to relay to the user
      // This is better than having the model invent driver details
      return `Order successfully accepted! Driver #${driverNumber} has been assigned and will arrive shortly at ${args.from}. Destination: ${args.to}.`;
    }
  }
];

function askQuestion(query) {
  return new Promise((resolve) => {
    readline.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// System prompt for the model
const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your goal is to help the customer book a taxi.
1. Clarify the origin ('from') and destination ('to') addresses if the customer hasn't provided them. Be polite.
2. Once the addresses are known, MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm they accept the cost and are ready to book (e.g., with words like "book it", "okay", "yes", "go ahead").
4. After customer confirmation, use the 'acceptOrder' tool, passing it the 'from' and 'to' addresses.
5. After calling 'acceptOrder', relay the result returned by the tool to the customer.
6. Do not invent driver numbers or order statuses yourself; rely on the response from the 'acceptOrder' tool.
7. If the user asks something unrelated to booking a taxi, politely steer the conversation back to the topic.`;

async function chatWithTaxiBot() {
  // Unique ID for the user session (to separate history)
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nBot Kit: Hello! I'm your virtual assistant for booking a taxi. Where would you like to go? (Session ID: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
          console.log("Bot Kit: Thank you for contacting us! Goodbye.");
          break;
      }

      console.log("Bot Kit: One moment, processing your request...");
      const result = await client.chat({
        user: userId, // Enable history for this user
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide tools to the model
        model: "openai/gpt-4o-mini", // Can specify a different model for example
        temperature: 0.5, // Slightly reduce creativity for predictability
        maxToolCalls: 5 // Limit the number of tool call rounds
      });

      // Display the model's response
      console.log(`\nBot Kit: ${result.content}\n`);

      // Debug information
      if (client.isDebugMode()) { // Use isDebugMode() to check
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
      }

      // If the acceptOrder tool was successfully called (via flag)
      if (orderAccepted) {
        // The acceptance message should already be in result.content,
        // as we return a string from acceptOrder's execute().
        console.log("Bot Kit: If you have any more questions, feel free to ask!");
        // Could add a break here if the dialog should end after ordering
        // break;
      }
    }
  } catch (error) {
    console.error("\n--- An Error Occurred ---");
    if (error instanceof Error) {
        console.error(`Type: ${error.constructor.name}`);
        console.error(`Message: ${error.message}`);
        if (error.code) console.error(`Code: ${error.code}`);
        if (error.statusCode) console.error(`Status: ${error.statusCode}`);
        if (error.details) console.error(`Details:`, error.details);
    } else {
        console.error("Unknown error:", error);
    }
  } finally {
    readline.close();
    // Release client resources
    await client.destroy();
    console.log("\nClient stopped. Session ended.");
  }
}

// Start the bot
chatWithTaxiBot();
```

## ⚙️ API and Concepts

### `OpenRouterClient`

The main class for interacting with the library.

#### Configuration (`OpenRouterConfig`)

When creating a client (`new OpenRouterClient(config)`), a configuration object is passed with the following main fields:

*   `apiKey` (string, **required**): Your OpenRouter API key. Recommended to store in environment variables (`process.env.OPENROUTER_API_KEY`).
*   `model` (string, optional): Default model for all requests (e.g., `'google/gemini-2.0-flash-001'`).
*   `debug` (boolean, optional): Enable detailed logging of all operations (default: `false`).
*   `historyAdapter` (IHistoryStorage, optional): An instance of a history storage adapter (e.g., `new DiskHistoryStorage('./my-chats')`). If not provided, `MemoryHistoryStorage` is used.
*   `historyAutoSave` (boolean, optional): Automatically save history on process exit (only for adapters supporting persistence, like `DiskHistoryStorage`).
*   `historyTtl` (number, optional): Time-to-live for history entries in milliseconds (default: 24 hours). Entries older than this may be deleted during cleanup.
*   `historyCleanupInterval` (number, optional): How often to run the background task for cleaning up stale history, in milliseconds (default: 1 hour).
*   `maxHistoryEntries` (number, optional): Maximum number of *messages* (not pairs) to store in a single conversation history (default: 40). Older messages are discarded.
*   `maxToolCalls` (number, optional): Maximum number of tool call rounds (request -> call -> result -> request) within a single `client.chat()` call (default: 10). Prevents infinite loops.
*   `security` (SecurityConfig, optional): Configuration object for the security module. **Crucial for safely handling tools.** (See [Security Module](#-security-module-securitymanager)).
*   `proxy` (string | object, optional): HTTP/HTTPS proxy settings. Either a URL string (`'http://user:pass@host:port'`) or an object (`{ host: string, port: number | string, user?: string, pass?: string }`).
*   `apiEndpoint` (string, optional): Custom OpenRouter API URL for chat completions (default: `'https://openrouter.ai/api/v1/chat/completions'`).
*   `referer` (string, optional): Value of the `HTTP-Referer` header for API requests (for your stats on OpenRouter).
*   `title` (string, optional): Value of the `X-Title` header for API requests (for your stats on OpenRouter).
*   `modelFallbacks` (string[], optional): List of fallback model IDs to try in order if the primary model request (`config.model` or `options.model`) fails.
*   `responseFormat` (ResponseFormat, optional): Default response format for all requests (e.g., `{ type: 'json_object' }`). Can be overridden in `client.chat()`.
*   `strictJsonParsing` (boolean, optional): If `true`, when requesting JSON (`responseFormat`) and receiving invalid JSON, a `ValidationError` will be thrown. If `false` (default), the `content` field in the result will be `null`.
*   `axiosConfig` (AxiosRequestConfig, optional): Additional settings passed directly to Axios (e.g., custom headers, timeouts, `httpsAgent`).
*   `enableCostTracking` (boolean, optional): Enable calculation of call costs (default: `false`). Requires additional requests to the `/models` API.
*   `priceRefreshIntervalMs` (number, optional): Interval for automatically refreshing the model price cache in milliseconds (default: 6 hours).
*   `initialModelPrices` (Record<string, ModelPricingInfo>, optional): Provide initial model prices (e.g., from your config or cache) to avoid the first request to `/models` on startup.

#### Core Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: The primary method for sending requests to the model. Automatically manages history (if `options.user` is provided) and handles tool calls (if `options.tools` are provided).
    *   `options`: Object containing request parameters (see `OpenRouterRequestOptions` in `types/index.ts`). Key options: `prompt` or `customMessages`, `user?`, `tools?`, `model?`, `systemPrompt?`, `accessToken?`, `maxToolCalls?`, `responseFormat?`, `temperature?`, `maxTokens?`, etc.
    *   Returns `Promise<ChatCompletionResult>` - an object with fields:
        *   `content`: The final model response (string, JSON object, or `null` on JSON parsing error).
        *   `usage`: Total token usage for the entire `chat()` cycle (including tool calls): `{ prompt_tokens, completion_tokens, total_tokens }` or `null`.
        *   `model`: ID of the model that generated the *final* response.
        *   `toolCallsCount`: Total number of *successfully executed* tool calls within this `chat()` invocation.
        *   `finishReason`: Reason why the *final* response generation stopped (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
        *   `durationMs`: Total execution time of the `chat()` method in milliseconds.
        *   `id`: ID of the *last* request made to the OpenRouter API.
        *   `cost`: Calculated cost (USD) of the entire `chat()` call, or `null` if tracking is disabled (`enableCostTracking: false`) or prices for the used models are unknown.
*   `setModel(model: string)`: Sets the default model for subsequent `chat()` calls.
*   `setApiKey(apiKey: string)`: Updates the API key used for requests.
*   `createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string`: Creates a JWT access token. Requires `SecurityManager` to be configured for JWT (`userAuthentication.type: 'jwt'` and `jwtSecret` must be set).
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches the current OpenRouter credit balance for the used API key. Returns `{ limit: number, usage: number }`.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns an object containing the cached model prices (`{ promptCostPerMillion, completionCostPerMillion, ... }`). Relevant if `enableCostTracking: true`.
*   `refreshModelPrices(): Promise<void>`: Forcefully triggers an update of the model price cache from the OpenRouter API. Relevant if `enableCostTracking: true`.
*   `on(event: string, handler: (payload: any) => void)`: Subscribe to events.
    *   `'error'`: Global library errors (payload: `OpenRouterError`).
    *   Security events (if `SecurityManager` is enabled): `'access:denied'`, `'ratelimit:exceeded'`, `'security:dangerous_args'`, `'token:invalid'`, `'user:authenticated'`, `'tool:call'`, etc. (see `SecurityManager`).
*   `off(event: string, handler: (payload: any) => void)`: Unsubscribe from events.
*   `getHistoryManager(): UnifiedHistoryManager | undefined`: Returns the history manager instance (if used).
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager instance (if configured).
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker instance (if enabled).
*   `isDebugMode(): boolean`: Checks if debug mode is enabled.
*   `use(plugin: OpenRouterPlugin): Promise<void>`: Register a plugin.
*   `useMiddleware(fn: MiddlewareFunction): void`: Register a middleware function.
*   `destroy(): Promise<void>`: **IMPORTANT!** Releases all resources used by the client (stops history and price refresh timers, clears caches, removes `process.exit` handlers if attached). **Must be called when done with the client**, especially in server applications or tests, to prevent memory leaks and hanging processes.

### 🧩 Plugins and Middleware

Plugins and middleware provide powerful mechanisms for extending and customizing `OpenRouterClient` functionality.

**Plugins (`client.use(plugin)`):**

*   The primary way to add complex or integrated functionality.
*   A plugin is an object with an async or sync `init(client: OpenRouterClient)` method.
*   Inside `init`, a plugin can:
    *   Register middleware (`client.useMiddleware(...)`).
    *   Subscribe to client or manager events (`client.on(...)`).
    *   Replace standard managers (history, security, cost) with custom implementations using `client.setHistoryManager(...)`, `client.setSecurityManager(...)`, `client.setCostTracker(...)`. *Note: These setters might be non-public and accessed via `client['propertyName'] = ...` or need to be added to the public API.*
    *   Add new methods or properties to the client instance (`client.myCustomMethod = ...`).
*   **Examples:** Integrating with external monitoring systems, implementing custom authentication logic, adding complex response caching.

**Bundled Plugins (in `plugins/` directory):**

*   `createRedisHistoryPlugin(redisUrl, prefix?)`: Replaces the standard history manager with `UnifiedHistoryManager` using a Redis adapter. Requires `ioredis` to be installed.
    ```typescript
    import { createRedisHistoryPlugin } from 'openrouter-kit/plugins';
    // const { createRedisHistoryPlugin } = require('openrouter-kit/plugins'); // CommonJS
    // Install: npm install ioredis
    await client.use(createRedisHistoryPlugin('redis://localhost:6379'));
    ```
*   Other plugins in the directory (`ExternalSecurity`, `BillingCostTracker`, `LoggingMiddleware`, `CustomToolRegistry`) serve as examples for creating your own.

**Middleware (`client.useMiddleware(fn)`):**

*   Functions executed before and/or after the main API request within `client.chat()`.
*   Use the standard `async (ctx, next) => { ... await next(); ... }` pattern.
*   `ctx` (MiddlewareContext): Object containing `request` (incoming options) and `response` (result or error). Middleware can modify these fields.
*   `next`: Function to call the next middleware or the core `chat` handler.
*   **Examples:** Logging requests/responses, modifying request options (adding headers, changing model), caching responses, checking budget before request, auditing actions.

**Example Middleware for Request Cost Limiting:**

```typescript
client.useMiddleware(async (ctx, next) => {
  const MAX_COST_PER_CALL = 0.01; // Max $0.01 per call
  const costTracker = client.getCostTracker();
  const model = ctx.request.options.model || client.model; // Determine the model

  if (costTracker) {
    // Approximate cost estimation *before* the call (can be inaccurate without token counts)
    // Logic to check user balance or limits could be added here
    console.log(`[Middleware Cost Check] Calling model ${model}.`);
  }

  await next(); // Execute the core request and other middleware

  // Check cost *after* the call
  if (ctx.response?.result?.cost && ctx.response.result.cost > MAX_COST_PER_CALL) {
    console.warn(`[Middleware Cost Alert] Call cost (${ctx.response.result.cost.toFixed(6)}$) exceeded limit ${MAX_COST_PER_CALL}$`);
    // Logic for notifications or blocking further requests could be added here
  }
});
```

### 📜 History Management (Adapters)

The library uses `UnifiedHistoryManager` to manage conversation history, which operates on top of an abstract `IHistoryStorage` interface (adapter). This allows easily changing how history is stored.

*   **Adapter (`IHistoryStorage`):** Interface defining `load`, `save`, `delete`, `listKeys` methods.
*   **Built-in Adapters:**
    *   `MemoryHistoryStorage`: Stores history in memory (default). Suitable for simple cases and testing. Data is lost on restart.
    *   `DiskHistoryStorage`: Stores history in JSON files on disk. Configured via `chatsFolder` in the client config. Suitable for persisting history between sessions on a single server.
*   **Configuration:**
    *   `historyAdapter`: Pass an instance of your adapter (e.g., `new DiskHistoryStorage('./data/chats')`) or use `historyStorage: 'disk'` for the built-in disk adapter.
    *   `maxHistoryEntries`, `historyTtl`, `historyCleanupInterval`, `historyAutoSave` configure the history manager's behavior.
*   **Usage:** Simply pass `user` (and optionally `group`) in `client.chat()`. The manager automatically loads, uses, and saves history for the key derived from `user` and `group`.
*   **Custom Adapters:** You can implement `IHistoryStorage` for any storage backend (DB, Redis, cloud storage). The `RedisHistoryStorage` (used in `createRedisHistoryPlugin`) serves as an example.

**Example with Disk Storage:**

```typescript
import OpenRouter from 'openrouter-kit';
import { DiskHistoryStorage } from 'openrouter-kit/history'; // Import the adapter

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  historyAdapter: new DiskHistoryStorage('./.my-chat-history'), // Specify folder
  maxHistoryEntries: 50, // Store more messages
  historyAutoSave: true, // Save on exit
});

// Further use of client.chat({ user: '...', prompt: '...' })
// will persist history in the ./.my-chat-history folder
```

### 🛠️ Tool Handling (Function Calling)

Allows LLMs to call your functions to retrieve information or perform actions.

1.  **Define a Tool (`Tool` interface):**
    *   `type: 'function'` (currently the only type).
    *   `function`: Object describing the function for the LLM:
        *   `name` (string): Function name.
        *   `description` (string, optional): Description of what the function does (important for the LLM).
        *   `parameters` (object, optional): JSON Schema describing the expected arguments. Used for validation.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Your function** to be called. Receives parsed and validated arguments (`args`) and optional context (`context`) containing `userInfo` (if authenticated) and `securityManager`. Should return a result that will be JSON-serialized and sent back to the LLM.
    *   `security` (ToolSecurity, optional): Tool-specific security rules (e.g., `requiredRole`, `rateLimit`).

2.  **Use in `chat()`:**
    *   Pass an array of defined tools in `options.tools`.
    *   The library automatically handles the full cycle:
        *   Sends tool definitions to the model.
        *   If the model requests a tool call (`finish_reason: 'tool_calls'`):
            *   Parses arguments from the model's response (`ToolCall.function.arguments`).
            *   Validates arguments against the JSON Schema (`Tool.function.parameters`).
            *   **Performs security checks** (`SecurityManager`, if configured): access (ACL), rate limits, argument sanitization.
            *   Calls your `execute(args, context)` function.
            *   Sends the result (or execution error) back to the model in a `role: 'tool'` message.
            *   Receives the final response from the model (with `role: 'assistant'`).
    *   `options.maxToolCalls`: Limits the number of "request-call-result" cycles.
    *   `options.toolChoice`: Allows forcing a specific tool or disabling tools (`'none'`, `'auto'`, `{ type: "function", function: { name: "my_func" } }`).

3.  **Result:** The final model response is in `ChatCompletionResult.content`. `ChatCompletionResult.toolCallsCount` indicates how many tools were called.

### 🔒 Security Module (`SecurityManager`)

Provides comprehensive protection when working with tools. Activated by passing a `security: SecurityConfig` object to the client constructor. **Highly recommended when using tools**, especially if they perform actions or access sensitive data.

**Components:**

*   `AuthManager`: Handles authentication (JWT by default).
*   `AccessControlManager`: Checks permissions to access tools (ACL).
*   `RateLimitManager`: Manages call limits.
*   `ArgumentSanitizer`: Checks arguments for malicious content.

**Configuration (`SecurityConfig`):**

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): Default access to tools if no specific rules match. `'deny-all'` is recommended.
*   `requireAuthentication` (boolean): If `true`, a valid `accessToken` is required for *any* tool call.
*   `allowUnauthenticatedAccess` (boolean): If `true` and `requireAuthentication: false`, allows calls to tools explicitly permitted for anonymous users without an `accessToken`.
*   `userAuthentication` (`UserAuthConfig`): Authentication settings.
    *   `type`: `'jwt'`, `'api-key'`, `'custom'`.
    *   `jwtSecret`: **REQUIRED** for `type: 'jwt'`. Use a strong secret from environment variables. **Never use default secrets in production!**
    *   `customAuthenticator`: Function to validate custom tokens/keys.
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Access rules per tool name (or `*` for all).
    *   `allow` (boolean): Explicitly allow/deny.
    *   `roles` (string | string[]): Roles allowed access.
    *   `scopes` (string | string[]): Permissions allowed access.
    *   `rateLimit` (`RateLimit`): Call limit for this tool (overrides role limits).
    *   `allowedApiKeys` (string[]): Specific API keys allowed access.
*   `roles` (`RolesConfig`): Role definitions.
    *   `roles`: Object where keys are role names, values are `RoleConfig`:
        *   `allowedTools` (string | string[]): Tools allowed for the role (`*` for all).
        *   `rateLimits` (`Record<string, RateLimit>`): Call limits for this role (key is tool name or `*`).
*   `dangerousArguments` (`DangerousArgumentsConfig`): Argument sanitization settings.
    *   `globalPatterns`, `toolSpecificPatterns`, `extendablePatterns` (RegExp[] | string[]): Patterns to detect dangerous content.
    *   `blockedValues` (string[]): Forbidden substrings.
    *   `auditOnlyMode` (boolean): If `true`, dangerous arguments are logged but the call is not blocked.

**Usage:**

1.  Configure `SecurityManager` by passing `security: securityConfig` to the client constructor.
2.  When calling `client.chat()`, pass `accessToken: 'your_jwt_token'` in the options if authentication is required.
3.  `SecurityManager` automatically performs all checks before calling a tool's `execute` function. Violations will throw appropriate errors (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`).
4.  Use `client.createAccessToken(userInfo, expiresIn?)` to generate JWTs.
5.  Subscribe to security events (`access:denied`, `ratelimit:exceeded`, etc.) via `client.on(...)` for monitoring.

### 📈 Cost Tracking

Allows estimating the costs of using the OpenRouter API.

**Enable:** Set `enableCostTracking: true` in the client config.

**Mechanism:**

1.  `CostTracker` is initialized with the client.
2.  It periodically (default: every 6 hours, configurable via `priceRefreshIntervalMs`) fetches model prices from the `https://openrouter.ai/api/v1/models` endpoint.
3.  Prices are cached. Initial prices can be provided via `initialModelPrices`.
4.  After each `chat()` call, `CostTracker.calculateCost(model, usage)` is invoked to calculate the cost based on tokens (`usage`) and cached prices.
5.  The result is added to `ChatCompletionResult.cost`.

**Client Methods:**

*   `getCreditBalance(): Promise<CreditBalance>`: Get credit limit and current usage.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Get the price cache.
*   `refreshModelPrices(): Promise<void>`: Force-refresh the price cache.
*   `getCostTracker(): CostTracker | null`: Get the tracker instance.

**Accuracy:** The calculation is an **estimate**, as exact pricing and application methods may change on OpenRouter's side.

### ⚙️ Response Format (`responseFormat`)

Forces the model to generate output in JSON format. Can be set in the client config (default) or in `client.chat()` options (per-request).

*   `{ type: 'json_object' }`: Requires any valid JSON object.
*   `{ type: 'json_schema', json_schema: { name: 'MySchema', schema: { ... } } }`: Requires JSON conforming to the provided JSON Schema. `name` is an arbitrary identifier, `schema` is the JSON Schema object itself.

**Important Notes:**
*   Not all models support `responseFormat`.
*   When using `responseFormat`, the model can only generate JSON. Normal text output is not possible in the same call.
*   **Parsing Error Handling:**
    *   If `strictJsonParsing: false` (default): On invalid JSON or schema mismatch, `ChatCompletionResult.content` will be `null`.
    *   If `strictJsonParsing: true`: A `ValidationError` will be thrown.

### ⚠️ Error Handling

The library uses a hierarchy of custom errors inheriting from `OpenRouterError`.

*   **`OpenRouterError`**: Base class. Contains `message`, `code` (from `ErrorCode`), `statusCode?`, `details?`.
*   **Subclasses:** `APIError`, `ValidationError`, `NetworkError`, `AuthenticationError`, `AuthorizationError`, `AccessDeniedError`, `ToolError`, `RateLimitError`, `TimeoutError`, `ConfigError`, `SecurityError`.
*   **`ErrorCode` (enum):** String codes to identify error types (e.g., `ErrorCode.RATE_LIMIT_ERROR`, `ErrorCode.DANGEROUS_ARGS`).
*   **`mapError(error: any)`:** Internal function (exported) to convert Axios or standard `Error` objects into an `OpenRouterError`.

**Recommendations:**

*   Use `try...catch` around `client.chat()` and other method calls.
*   Check the error type using `instanceof` (e.g., `error instanceof RateLimitError`) or `error.code` (e.g., `error.code === ErrorCode.VALIDATION_ERROR`).
*   Use `error.statusCode` for the HTTP status (if applicable).
*   Check `error.details` for additional information.
*   Subscribe to the client's `'error'` event for global error handling: `client.on('error', (err) => console.error('Global Error:', err));`.

### 📝 Logging

*   A built-in `Logger` is used throughout the library.
*   Activated by the `debug: true` flag in the client configuration.
*   Outputs messages with prefixes (e.g., `[SecurityManager]`, `[CostTracker]`) for easy source identification.
*   Uses `console.log`, `console.debug`, `console.warn`, `console.error`.

### 🌐 Proxy

Configure an HTTP/HTTPS proxy via the `proxy` field in `OpenRouterConfig`:

```typescript
// URL string format
const client1 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:pass@your-proxy.com:8080'
});

// Object format
const client2 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: {
      host: 'proxy.example.com',
      port: 8888, // Can be number or string
      user: 'optional_user', // optional
      pass: 'optional_pass' // optional
  }
});
```

## 📄 License

[MIT](./LICENSE)