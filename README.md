# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It significantly simplifies working with LLMs by providing a high-level API for chats, automatic management of conversation history (**when an adapter is configured**), seamless handling of tool calls (function calling), a robust and configurable security module, and optional request cost tracking. It's ideal for building chatbots, AI agents, and integrating LLMs into your applications.

## Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, and tool handling are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, **history storage (requires adapter)**, security, and much more.
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
*   **📜 History Management:** **Requires `historyAdapter` configuration.** Automatic loading, saving, and trimming of conversation history for each user or group, if `user` is passed to `client.chat()`.
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Includes built-in adapters for memory (`MemoryHistoryStorage`) and disk (`DiskHistoryStorage`, JSON files).
    *   Easily plug in custom adapters (Redis, MongoDB, API, etc.) or use the provided plugin (`createRedisHistoryPlugin`).
    *   Configurable TTL, limits, and cleanup intervals via client options.
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
*   **⚙️ Flexible Configuration:** Configure API key, default model, endpoint, timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limit (`maxToolCalls`), cost tracking (`enableCostTracking`), **history adapter (`historyAdapter`)**, and many other parameters via `OpenRouterConfig`.
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
// !!! IMPORTANT: Import the history adapter !!!
// Use the correct path depending on your 'dist' structure
// or main library export
import { MemoryHistoryStorage } from 'openrouter-kit/dist/history/memory-storage';
// Or, if you exported it from index.ts:
// import { MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...', // Use environment variables!
  // !!! IMPORTANT: Provide an adapter to enable history !!!
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Optional: enable cost calculation
  debug: false,             // Optional: enable detailed logs
});

async function main() {
  try {
    console.log('Sending request...');
    const result = await client.chat({ // Get the ChatCompletionResult object
      prompt: 'Say hi to the world!',
      model: 'google/gemini-2.0-flash-001', // Optional: override the model
      user: 'test-user-1', // Optional: User ID for history saving
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

    // Example: Get history (will work since historyAdapter was provided)
    const historyManager = client.getHistoryManager(); // Get the history manager
    if (historyManager) { // Ensure manager exists
        const historyKey = `user:test-user-1`; // Example key
        const history = await historyManager.getHistory(historyKey);
        console.log(`\nMessages stored in history for ${historyKey}: ${history.length}`);
    }

  } catch (error: any) {
    // Error handling (see "Error Handling" section)
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    if (error.statusCode) console.error(`HTTP Status: ${error.statusCode}`);
    if (error.details) console.error(`Details:`, error.details);
    // console.error(error.stack);
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
// !!! IMPORTANT: Require the adapter from its file !!!
const { MemoryHistoryStorage } = require("openrouter-kit/dist/history/memory-storage");
// Or, if you exported it from index.js:
// const { MemoryHistoryStorage } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // !!! IMPORTANT: Provide an adapter to enable history !!!
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Optional
});

async function main() {
  try {
    const result = await client.chat({
        prompt: 'Hello, world!',
        user: 'commonjs-user' // Specify user to save history
    });
    console.log('Model Response:', result.content);
    console.log('Usage:', result.usage);
    console.log('Cost:', result.cost);

    // Get history
    const historyManager = client.getHistoryManager();
    if (historyManager) {
        const history = await historyManager.getHistory('user:commonjs-user'); // Key formed internally
        console.log(`\nHistory for 'user:commonjs-user': ${history.length} messages`);
    }

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

This example demonstrates using conversation history and tool calling. **Note the mandatory addition of `historyAdapter` and the corresponding `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");
// !!! IMPORTANT: Require MemoryHistoryStorage directly !!!
const { MemoryHistoryStorage } = require("openrouter-kit/dist/history/memory-storage");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Example proxy configuration (if needed)
// const proxyConfig = {
//   host: "",
//   port: "",
//   user: "",
//   pass: "",
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...", // Replace!
  model: "google/gemini-2.0-flash-001",
  // !!! IMPORTANT: Provide an adapter to enable history !!!
  historyAdapter: new MemoryHistoryStorage(),
//  proxy: proxyConfig,
  enableCostTracking: true,
  debug: false,
  // security: { /* ... */ }
});

let orderAccepted = false;

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
    execute: async (args) => {
      console.log(`[Tool estimateRideCost] Calculating cost from ${args.from} to ${args.to}...`);
      const cost = Math.floor(Math.random() * 900) + 100;
      console.log(`[Tool estimateRideCost] Calculated cost: ${cost} RUB`);
      return { estimatedCost: cost, currency: "RUB" };
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
          estimatedCost: { type: "number", description: "Approximate ride cost (if known)"}
        },
        required: ["from", "to"]
      },
    },
    execute: async (args, context) => {
      console.log(`[Tool acceptOrder] Accepting order from ${args.from} to ${args.to}...`);
      console.log(`[Tool acceptOrder] Order initiated by user: ${context?.userInfo?.userId || 'anonymous'}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true;
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

// System prompt in English for consistency
const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your goal is to help the customer book a taxi.
1. Clarify the origin ('from') and destination ('to') addresses if the customer hasn't provided them. Be polite.
2. Once the addresses are known, MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm they accept the cost and are ready to book (e.g., with words like "book it", "okay", "yes", "go ahead").
4. After customer confirmation, use the 'acceptOrder' tool, passing it the 'from' and 'to' addresses.
5. After calling 'acceptOrder', relay the result returned by the tool to the customer.
6. Do not invent driver numbers or order statuses yourself; rely on the response from the 'acceptOrder' tool.
7. If the user asks something unrelated to booking a taxi, politely steer the conversation back to the topic.`;

async function chatWithTaxiBot() {
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
      // Pass user: userId, history will be managed automatically
      // because historyAdapter was provided
      const result = await client.chat({
        user: userId,
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools,
        temperature: 0.5,
        maxToolCalls: 5
      });

      console.log(`\nBot Kit: ${result.content}\n`);

      if (client.isDebugMode()) {
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
      }

      if (orderAccepted) {
        console.log("Bot Kit: If you have any more questions, feel free to ask!");
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
    await client.destroy();
    console.log("\nClient stopped. Session ended.");
  }
}

chatWithTaxiBot();
```

## ⚙️ API and Concepts

### `OpenRouterClient`

The main class for interacting with the library.

#### Configuration (`OpenRouterConfig`)

When creating a client (`new OpenRouterClient(config)`), a configuration object is passed. Key fields are described above. **Important:** To use history features, `historyAdapter` must be specified.

#### Core Methods

Described above. The `chat` method will only manage history if `user` is passed **and** `historyAdapter` is configured in the client.

### 🧩 Plugins and Middleware

Described above. Allow extending functionality.

### 📜 History Management (Adapters)

To enable automatic conversation history management (loading, saving, trimming when `user` is passed to `client.chat()`), you **must configure `historyAdapter`** in `OpenRouterConfig`. Without it, history features will not work.

*   **Adapter (`IHistoryStorage`):** Defines the interface for storage (`load`, `save`, `delete`, `listKeys`).
*   **Built-in Adapters:**
    *   `MemoryHistoryStorage`: Stores history in RAM.
        ```typescript
        // TypeScript Import
        import { MemoryHistoryStorage } from 'openrouter-kit/dist/history/memory-storage';
        // CommonJS Require
        // const { MemoryHistoryStorage } = require('openrouter-kit/dist/history/memory-storage');

        const client = new OpenRouter({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
        ```
    *   `DiskHistoryStorage`: Stores history in JSON files on disk.
        ```typescript
        // TypeScript Import
        import { DiskHistoryStorage } from 'openrouter-kit/dist/history/disk-storage';
        // CommonJS Require
        // const { DiskHistoryStorage } = require('openrouter-kit/dist/history/disk-storage');

        const client = new OpenRouter({ /*...,*/ historyAdapter: new DiskHistoryStorage('./my-chats') });
        ```
    *   **Note:** Paths for `import`/`require` might change if you reorganize library exports.
*   **Redis Plugin:** Use `createRedisHistoryPlugin` for easy Redis integration (requires `ioredis`).
*   **Settings:** `maxHistoryEntries`, `historyTtl`, `historyCleanupInterval` control the behavior of `UnifiedHistoryManager`, which uses the provided adapter.

### 🛠️ Tool Handling (Function Calling)

This feature allows LLM models to call your own JavaScript/TypeScript functions to retrieve external information, interact with other APIs, or perform real-world actions.

1.  **Define a Tool (`Tool` interface):**
    You define each tool as an object conforming to the `Tool` interface. Key fields:
    *   `type: 'function'` (currently the only supported type).
    *   `function`: An object describing the function for the LLM:
        *   `name` (string): The unique name of the function that the model will use to call it.
        *   `description` (string, optional): A clear description of what the function does and when it should be used. This is **crucial** for the model to understand the tool's purpose.
        *   `parameters` (object, optional): A [JSON Schema](https://json-schema.org/) object describing the structure, types, and required fields of the arguments your function expects. The library uses this schema to validate arguments received from the model. If no arguments are needed, this field can be omitted.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Your async or sync function** that will be executed when the model requests this tool call.
        *   `args`: An object containing the arguments provided by the model, already parsed from the JSON string and (if a schema was provided) validated against `parameters`.
        *   `context?`: An optional `ToolContext` object containing additional information about the call, such as:
            *   `userInfo?`: A `UserAuthInfo` object with data about the authenticated user (if `SecurityManager` is used and an `accessToken` was provided).
            *   `securityManager?`: The `SecurityManager` instance (if used).
    *   `security` (ToolSecurity, optional): An object for defining tool-specific security rules, such as `requiredRole`, `requiredScopes`, or `rateLimit`. These rules are checked by the `SecurityManager` before `execute` is called.

2.  **Use in `client.chat()`:**
    *   Pass an array of your defined tools in the `tools` option of the `client.chat()` method.
    *   The library handles the entire complex interaction flow automatically:
        1.  Sends the tool definitions (name, description, parameter schema) to the model along with your prompt.
        2.  If the model decides it needs to call one or more tools to respond, it will return a response with `finish_reason: 'tool_calls'` and a list of `tool_calls`.
        3.  The library intercepts this response. For each requested `toolCall`:
            *   Finds the corresponding tool in your `tools` array by name.
            *   Parses the argument string (`toolCall.function.arguments`) into a JavaScript object.
            *   Validates the resulting argument object against the JSON Schema specified in `tool.function.parameters` (if provided).
            *   **Performs security checks** via `SecurityManager` (if configured): verifies user (`userInfo`) permissions for this tool, applies rate limits, and checks arguments for dangerous content.
            *   If all checks pass, calls your `tool.execute(parsedArgs, context)` function.
            *   Waits for the result (or catches errors) from your `execute` function.
            *   Formats the result (or error information) and sends it back to the model in a new message with `role: 'tool'` and the `tool_call_id`.
        4.  The model receives the tool call results and generates the final, meaningful response to the user (now with `role: 'assistant'`).
    *   The `maxToolCalls` option in `client.chat()` or the client configuration limits the maximum number of these "request-call-result" cycles to prevent infinite loops if the model continuously requests tools.
    *   The `toolChoice` option allows controlling the model's tool selection: `'auto'` (default), `'none'` (disable tool calls), or force a specific function call `{ type: "function", function: { name: "my_tool_name" } }`.

3.  **Result:** The final model response (after all potential tool calls) will be available in `ChatCompletionResult.content`. The `ChatCompletionResult.toolCallsCount` field indicates how many times tools were successfully called and executed within that single `client.chat()` invocation.

### 🔒 Security Module (`SecurityManager`)

Provides multi-layered protection when using tools, which is crucial if tools can perform actions or access data. Activated by passing a `security: SecurityConfig` object to the client constructor.

**Components:**

*   `AuthManager`: Handles user authentication. Supports JWT out-of-the-box. Generates (`createAccessToken`) and validates (`authenticateUser`) tokens. Uses `jwtSecret` from config. Can be extended for other methods via `customAuthenticator`.
*   `AccessControlManager`: Checks if an authenticated user (or anonymous user, if allowed) has permission to call a specific tool. Uses rules from `security.toolAccess` and `security.roles`. Considers the `defaultPolicy`.
*   `RateLimitManager`: Tracks and enforces call frequency limits for tools per user. Finds the relevant limit in the configuration (`security.roles`, `security.toolAccess`, or `tool.security`).
*   `ArgumentSanitizer`: Analyzes arguments passed to tool `execute` functions for potentially dangerous strings or patterns (e.g., SQL injection attempts, XSS, OS commands). Uses regular expressions and blocklists from `security.dangerousArguments`. Can operate in blocking or audit-only (`auditOnlyMode`) mode.

**Configuration (`SecurityConfig`):**

Defines the security module's behavior in detail. Key fields:

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): What to do if no explicit access rule exists for a tool? `'deny-all'` is recommended.
*   `requireAuthentication` (boolean): If `true`, a valid `accessToken` is required for *any* tool call.
*   `allowUnauthenticatedAccess` (boolean): If `true` and `requireAuthentication: false`, allows calls to tools explicitly permitted for anonymous users without an `accessToken`.
*   `userAuthentication` (`UserAuthConfig`): Configures the authentication method (`type: 'jwt'`, `jwtSecret`, `customAuthenticator`). **It is critical to set a strong `jwtSecret` if using JWT! Never use default secrets in production!**
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Access rules for specific tools (by name) or all tools (`'*'`). Includes `allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`.
*   `roles` (`RolesConfig`): Defines roles and their privileges (`allowedTools`, `rateLimits`).
*   `dangerousArguments` (`DangerousArgumentsConfig`): Settings for argument sanitization (`globalPatterns`, `toolSpecificPatterns`, `blockedValues`, `auditOnlyMode`).

**Usage:**

1.  Pass a `securityConfig` object to the `OpenRouterClient` constructor.
2.  For authenticated requests, pass the access token in `client.chat({ accessToken: '...' })`.
3.  When a tool is invoked, the library automatically calls `securityManager.checkToolAccessAndArgs()`, which performs all necessary checks (authentication, authorization, rate limits, arguments).
4.  If any rule is violated, an appropriate error (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`) is thrown, and the `execute` function is not called.
5.  Use `client.createAccessToken()` to generate JWTs (if configured).
6.  Subscribe to security events (`client.on('access:denied', ...)` etc.) for monitoring and response.

### 📈 Cost Tracking

Allows **estimating** the cost of each `client.chat()` call based on token usage and OpenRouter model prices.

*   **Enable:** Set `enableCostTracking: true` in `OpenRouterConfig`.
*   **Mechanism:**
    1.  A `CostTracker` instance is created with the client.
    2.  The `CostTracker` fetches current prices for all available models from the OpenRouter API `/models` endpoint. This happens on startup (unless `initialModelPrices` are provided) and then periodically (interval set by `priceRefreshIntervalMs`, default 6 hours).
    3.  The fetched prices (cost per million input and output tokens) are cached in memory.
    4.  After each successful `client.chat()` call, the library retrieves the token usage information (`usage`) from the API response.
    5.  `costTracker.calculateCost(model, usage)` is called, using the cached prices for the used model and the `usage` data to calculate the cost. It accounts for both prompt and completion tokens, including those used during tool calls (if any).
    6.  The calculated value (a number in USD) or `null` (if prices for the model are unknown or tracking is disabled) is added to the `cost` field of the returned `ChatCompletionResult` object.
*   **Related Client Methods:**
    *   `getCreditBalance(): Promise<CreditBalance>`: Fetches the current credit limit and usage from your OpenRouter account.
    *   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the current cache of model prices used by the tracker.
    *   `refreshModelPrices(): Promise<void>`: Forcefully triggers a background refresh of the model price cache.
    *   `getCostTracker(): CostTracker | null`: Provides access to the `CostTracker` instance (if enabled).
*   **Accuracy:** Keep in mind that this is an **estimate**. Actual costs might differ slightly due to rounding or changes in OpenRouter's pricing policy not yet reflected in the cache.

### ⚙️ Response Format (`responseFormat`)

Allows instructing the model to generate its response in JSON format, useful for obtaining structured data.

*   **Configuration:** Set via the `responseFormat` option in `OpenRouterConfig` (for a default format) or in the `options` of the `client.chat()` method (for a specific request).
*   **Types:**
    *   `{ type: 'json_object' }`: Instructs the model to return any valid JSON object.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Requires the model to return JSON that conforms to the provided JSON Schema.
        *   `name`: An arbitrary name for your schema.
        *   `schema`: The JSON Schema object describing the expected JSON structure.
        *   `strict` (optional): Request strict schema adherence (if supported by the model).
        *   `description` (optional): A description of the schema for the model.
*   **Example:**
    ```typescript
    const userSchema = {
      type: "object",
      properties: { name: { type: "string"}, age: {type: "number"} },
      required: ["name", "age"]
    };
    const result = await client.chat({
      prompt: 'Generate JSON for a user: name Alice, age 30.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      }
    });
    // result.content will contain the object { name: "Alice", age: 30 } or null/error
    ```
*   **Parsing Error Handling:**
    *   If the client option `strictJsonParsing: false` (default): If the model returns invalid JSON or JSON not matching the schema, the `ChatCompletionResult.content` field will be `null`.
    *   If the client option `strictJsonParsing: true`: In the same situation, a `ValidationError` will be thrown.
*   **Model Support:** Not all models guarantee support for `responseFormat`. Check the specific model's documentation.

### ⚠️ Error Handling

The library provides a structured error handling system to simplify debugging and control flow.

*   **Base Class `OpenRouterError`**: All library errors inherit from this. Contains:
    *   `message`: Human-readable error description.
    *   `code` (`ErrorCode`): String code for programmatically identifying the error type (e.g., `API_ERROR`, `VALIDATION_ERROR`, `RATE_LIMIT_ERROR`).
    *   `statusCode?` (number): HTTP status code from the API response, if applicable.
    *   `details?` (any): Additional data or the original error object.
*   **Subclasses**: Specific error situations use subclasses like:
    *   `APIError`: Error returned by the OpenRouter API (status >= 400).
    *   `ValidationError`: Data validation error (config, arguments, JSON/schema response).
    *   `NetworkError`: Network issue connecting to the API.
    *   `AuthenticationError`: Problem with the API key (usually 401).
    *   `AuthorizationError`: Invalid or expired access token (usually 401).
    *   `AccessDeniedError`: User authenticated but lacks permissions (usually 403).
    *   `RateLimitError`: Request limit exceeded (usually 429). Contains `details.timeLeft` (ms).
    *   `ToolError`: Error during the execution of a tool's `execute` function.
    *   `ConfigError`: Incorrect library configuration.
    *   `SecurityError`: General security error (includes `DANGEROUS_ARGS`).
    *   `TimeoutError`: API response timeout exceeded.
*   **`ErrorCode` Enum**: Contains all possible string error codes (`ErrorCode.API_ERROR`, `ErrorCode.TOOL_ERROR`, etc.).
*   **`mapError(error)` Function**: Used internally to convert Axios and standard `Error` objects into `OpenRouterError`. Exported for potential use.
*   **Handling Recommendations**:
    *   Use `try...catch` blocks around client method calls (`client.chat()`, `client.getCreditBalance()`, etc.).
    *   Check the error type using `instanceof` (e.g., `if (error instanceof RateLimitError)`) or the code (`if (error.code === ErrorCode.VALIDATION_ERROR)`).
    *   Analyze `error.statusCode` and `error.details` for context.
    *   Subscribe to the global client `'error'` event (`client.on('error', handler)`) for centralized logging or tracking of unexpected errors.

```typescript
import { OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

try {
  // ... client.chat() call ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 1000) / 1000); // Seconds
    console.warn(`Rate limit exceeded! Try again in ${retryAfter} sec.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Validation Error: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.TOOL_ERROR && error.message.includes('Maximum tool call depth')) {
     console.error(`Tool call depth limit reached: ${error.message}`);
  } else if (error instanceof OpenRouterError) {
    console.error(`OpenRouter Kit Error (${error.code}, Status: ${error.statusCode || 'N/A'}): ${error.message}`);
    if(error.details) console.error('Details:', error.details);
  } else {
    console.error(`Unknown Error: ${error.message}`);
  }
}
```

### 📝 Logging

The library uses a built-in logger for outputting debug information and event messages.

*   **Activation:** Set `debug: true` in `OpenRouterConfig` when creating the client.
*   **Levels:** Uses standard console levels: `console.debug`, `console.log`, `console.warn`, `console.error`. When `debug: false`, only critical warnings or errors during initialization are typically shown.
*   **Prefixes:** Messages are automatically prefixed with the component source (e.g., `[OpenRouterClient]`, `[SecurityManager]`, `[CostTracker]`, `[HistoryManager]`), aiding debugging.
*   **Customization:** While direct logger replacement isn't a standard API feature, you can pass your logger to some components (like `HistoryManager` if created manually) or use plugins/middleware to intercept and redirect logs.
*   **`isDebugMode()` Method:** Allows checking the current state of the client's debug mode (`client.isDebugMode()`).

### 🌐 Proxy

To route requests to the OpenRouter API through an HTTP/HTTPS proxy, use the `proxy` option in `OpenRouterConfig`.

*   **Formats:**
    *   **URL String:** The full proxy URL, including protocol, optional authentication, host, and port.
        ```typescript
        proxy: 'http://user:password@proxy.example.com:8080'
        ```
        ```typescript
        proxy: 'https://secureproxy.com:9000'
        ```
    *   **Object:** A structured object with fields:
        *   `host` (string, **required**): Proxy server hostname or IP.
        *   `port` (number | string, **required**): Proxy server port.
        *   `user?` (string, optional): Username for proxy authentication.
        *   `pass?` (string, optional): Password for proxy authentication.
        ```typescript
        proxy: {
          host: '192.168.1.100',
          port: 8888, // can also be string '8888'
          user: 'proxyUser',
          pass: 'proxyPassword'
        }
        ```
*   **Mechanism:** The library uses `https-proxy-agent` to route HTTPS traffic through the specified HTTP/HTTPS proxy.

## 📄 License

[MIT](./LICENSE)