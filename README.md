
# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It significantly simplifies working with LLMs by providing a high-level API for chats, automatic dialogue history management (**when an adapter is configured**), seamless handling of tool calls (function calling) with **structured error handling**, a robust and configurable security module, and optional request cost tracking. It's ideal for building chatbots, AI agents, and integrating LLMs into your applications.

## Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, and tool handling are hidden behind a simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, **history storage (requires adapter)**, security, and much more.
*   **Security:** The built-in security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the library core.
*   **Reliability:** Fully typed with TypeScript, predictable error handling (including structured tool errors), and resource management.

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
    *   [Response Format (`responseFormat`)](#️-response-format-responseformat)
    *   [Error Handling](#️-error-handling)
    *   [Logging](#-logging)
    *   [Proxy](#-proxy)
*   [📄 License](#-license)

## 🚀 Key Features

*   **🤖 Universal Chat:** Simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
    *   Returns a structured `ChatCompletionResult` object with content (`content`), token usage info (`usage`), model used (`model`), number of tool calls (`toolCallsCount`), finish reason (`finishReason`), execution time (`durationMs`), request ID (`id`), and **calculated cost** (`cost`, optional).
*   **📜 History Management (via Adapters):** **Requires `historyAdapter` configuration**. Automatic loading, saving, and (potentially) trimming of dialogue history for each user or group when `user` is passed to `client.chat()`.
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Includes built-in adapters for memory (`MemoryHistoryStorage`) and disk (`DiskHistoryStorage`, JSON files). Exported from the main module.
    *   Easily plug in custom adapters (Redis, MongoDB, API, etc.) or use the provided plugin (`createRedisHistoryPlugin`).
    *   Configure cache TTL and cleanup intervals via client options (`historyTtl`, `historyCleanupInterval`). History limit management is delegated to the adapter.
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for model-invoked calls to your functions.
    *   Define tools using the `Tool` interface and JSON Schema for argument validation.
    *   Automatic argument parsing, schema validation, and **security checks**.
    *   Execution of your `execute` functions with context (`ToolContext`, including `userInfo`).
    *   Automatic sending of results back to the model to get the final response.
    *   **Structured Tool Error Handling:** Errors occurring during parsing, validation, security checks, or tool execution are formatted as a JSON string (`{"errorType": "...", "errorMessage": "...", "details": ...}`) and sent back to the model in the `role: 'tool'` message, potentially allowing the LLM to understand and react to the issue better.
    *   Configurable limit on the maximum number of tool call rounds (`maxToolCalls`) to prevent infinite loops.
*   **🛡️ Security Module:** Comprehensive and configurable protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching) via `AuthManager`. Easily extensible for other methods (`api-key`, `custom`).
    *   **Access Control (ACL):** Flexible configuration of tool access (`AccessControlManager`) based on roles (`roles`), API keys (`allowedApiKeys`), permissions (`scopes`), or explicit rules (`allow`/`deny`). Default policy (`deny-all`/`allow-all`).
    *   **Rate Limiting:** Apply limits (`RateLimitManager`) on tool calls for users or roles with configurable periods and limits. **Important:** The default `RateLimitManager` implementation stores state in memory and is **not suitable for distributed systems** (multiple processes/servers). Custom adapters or plugins using external storage (e.g., Redis) are required for such scenarios.
    *   **Argument Sanitization:** Checks (`ArgumentSanitizer`) tool arguments for potentially dangerous patterns (SQLi, XSS, command injection, etc.) using global, tool-specific, and custom rules. Supports audit-only mode (`auditOnlyMode`).
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, `token:invalid`, `user:authenticated`, etc.) for monitoring and logging.
*   **📈 Cost Tracking:** (Optional)
    *   Automatic calculation of approximate cost for each `chat()` call based on token usage (`usage`) and OpenRouter model pricing.
    *   Periodic background updates of model prices from the OpenRouter API (`/models`).
    *   `getCreditBalance()` method to check your current OpenRouter credit balance.
    *   Access cached prices via `getModelPrices()`.
*   **⚙️ Flexible Configuration:** Configure API key, default model, endpoint (`apiEndpoint` for chat, base URL for other requests determined automatically), timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limit (`maxToolCalls`), cost tracking (`enableCostTracking`), **history adapter (`historyAdapter`)**, and many other parameters via `OpenRouterConfig`.
*   **💡 Typing:** Fully written in TypeScript, providing strong typing, autocompletion, and type checking during development.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, `ToolError`, `ConfigError`, etc.) inheriting from `OpenRouterError`, with codes (`ErrorCode`) and details for easy handling. Includes a `mapError` function for normalizing errors.
*   **📝 Logging:** Built-in flexible logger (`Logger`) with prefix support and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API hiding the complexity of underlying interactions with LLMs, history, and tools.
*   **🧹 Resource Management:** `client.destroy()` method for proper resource cleanup (timers, caches, event listeners), preventing leaks in long-running applications.
*   **🧩 Plugin System:** Extend client capabilities without modifying the core.
    *   Support for external and custom plugins via `client.use(plugin)`.
    *   Plugins can add middleware, replace managers (history, security, cost), subscribe to events, and extend the client API.
*   **🔗 Middleware Chain:** Flexible request and response processing before and after API calls.
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
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit'; // Import directly

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // !!! IMPORTANT: Provide an adapter to enable history !!!
  historyAdapter: new MemoryHistoryStorage(), // Use the imported class
  enableCostTracking: true,
  debug: false,
});

async function main() {
  try {
    console.log('Sending request...');
    const result = await client.chat({
      prompt: 'Say hi to the world!',
      model: 'google/gemini-2.0-flash-001',
      user: 'test-user-1', // User ID for history tracking
    });

    console.log('--- Result ---');
    console.log('Model Response:', result.content);
    console.log('Token Usage:', result.usage);
    console.log('Model Used:', result.model);
    console.log('Tool Calls Count:', result.toolCallsCount);
    console.log('Finish Reason:', result.finishReason);
    console.log('Duration (ms):', result.durationMs);
    if (result.cost !== null) {
      console.log('Estimated Cost (USD):', result.cost.toFixed(8));
    }
    console.log('Request ID:', result.id);

    console.log('\nChecking balance...');
    const balance = await client.getCreditBalance();
    console.log(`Credit Balance: Used $${balance.usage.toFixed(4)} of $${balance.limit.toFixed(2)}`);

    // Get history (will work since historyAdapter was provided)
    const historyManager = client.getHistoryManager();
    if (historyManager) {
        // Key is generated internally by the client, but showing format for example
        const historyKey = `user:test-user-1`;
        const history = await historyManager.getHistory(historyKey);
        console.log(`\nMessages stored in history for ${historyKey}: ${history.length}`);
    }

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    if (error.statusCode) console.error(`HTTP Status: ${error.statusCode}`);
    if (error.details) console.error(`Details:`, error.details);
    // console.error(error.stack);
  } finally {
    console.log('\nShutting down and releasing resources...');
    await client.destroy();
    console.log('Resources released.');
  }
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit"); // Destructure from main export

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // !!! IMPORTANT: Provide an adapter to enable history !!!
  historyAdapter: new MemoryHistoryStorage(), // Use the imported class
  enableCostTracking: true,
});

async function main() {
  try {
    const result = await client.chat({
        prompt: 'Hello, world!',
        user: 'commonjs-user' // Specify user for history saving
    });
    console.log('Model Response:', result.content);
    console.log('Usage:', result.usage);
    console.log('Cost:', result.cost);

    // Get history
    const historyManager = client.getHistoryManager();
    if (historyManager) {
        // Key is generated internally, showing format for example
        const historyKey = 'user:commonjs-user';
        const history = await historyManager.getHistory(historyKey);
        console.log(`\nHistory for '${historyKey}': ${history.length} messages`);
    }

  } catch (error) {
     console.error(`Error: ${error.message}`, error.details || error);
  } finally {
     await client.destroy();
  }
}

main();
```

## 🚕 Example: Taxi Bot

This example demonstrates using dialogue history and tool calling. **Note the required `historyAdapter` and the corresponding `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit"); // Destructure
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

// Example proxy config (if needed)
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
  historyAdapter: new MemoryHistoryStorage(), // Use imported class
//  proxy: proxyConfig,
  enableCostTracking: true,
  debug: false, // Set true for verbose logs
  // security: { /* ... */ } // Security config can be added here
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
          from: { type: "string", description: "Pickup address (e.g., '1 Lenin St, Moscow')" },
          to: { type: "string", description: "Destination address (e.g., '10 Tverskaya St, Moscow')" }
        },
        required: ["from", "to"]
      },
    },
    // Executable function for the tool
    execute: async (args) => {
      console.log(`[Tool estimateRideCost] Calculating cost from ${args.from} to ${args.to}...`);
      // Simulate cost calculation
      const cost = Math.floor(Math.random() * 900) + 100;
      console.log(`[Tool estimateRideCost] Calculated cost: ${cost} RUB`);
      // Return an object to be serialized to JSON
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
          from: { type: "string", description: "Confirmed pickup address" },
          to: { type: "string", description: "Confirmed destination address" },
          estimatedCost: { type: "number", description: "Approximate ride cost (if known)"}
        },
        required: ["from", "to"]
      },
    },
    // Executable function with context access
    execute: async (args, context) => {
      console.log(`[Tool acceptOrder] Accepting order from ${args.from} to ${args.to}...`);
      // Example of using context (if security is configured)
      console.log(`[Tool acceptOrder] Order initiated by user: ${context?.userInfo?.userId || 'anonymous'}`);
      // Simulate driver assignment
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Set flag to end the loop
      // Return a string for the model to relay to the user
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

const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your task is to help the customer book a taxi.
1. Clarify the pickup address ('from') and destination address ('to') if the customer hasn't provided them. Be polite.
2. Once the addresses are known, you MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm they accept the cost and are ready to order (e.g., with words like "book it", "okay", "yes", "sounds good").
4. After customer confirmation, use the 'acceptOrder' tool, passing it the 'from' and 'to' addresses.
5. After calling 'acceptOrder', inform the customer of the result returned by the tool.
6. Do not invent driver numbers or order statuses yourself; rely on the response from the 'acceptOrder' tool.
7. If the user asks something unrelated to booking a taxi, politely steer the conversation back to the topic.`;

async function chatWithTaxiBot() {
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nKit Bot: Hello! I'm your virtual assistant... (Session ID: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
          console.log("Kit Bot: Thank you for contacting us! Goodbye.");
          break;
      }

      console.log("Kit Bot: One moment, processing your request...");
      // Pass user: userId, history will be managed automatically
      // because historyAdapter was provided
      const result = await client.chat({
        user: userId, // Key for history
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide available tools
        temperature: 0.5,
        maxToolCalls: 5 // Limit tool call cycles
      });

      // Output the assistant's final response
      console.log(`\nKit Bot: ${result.content}\n`);

      // Output debug info if enabled
      if (client.isDebugMode()) {
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
      }

      // Check the flag set by the acceptOrder tool
      if (orderAccepted) {
        console.log("Kit Bot: If you have any more questions, I'm here to help!");
        // Optionally break here if the conversation should end after ordering
      }
    }
  } catch (error) {
    console.error("\n--- An Error Occurred ---");
    // Use instanceof to check error type
    if (error instanceof Error) {
        console.error(`Type: ${error.constructor.name}`);
        console.error(`Message: ${error.message}`);
        // Access custom fields via 'any' or type assertion
        if ((error as any).code) console.error(`Code: ${(error as any).code}`);
        if ((error as any).statusCode) console.error(`Status: ${(error as any).statusCode}`);
        if ((error as any).details) console.error(`Details:`, (error as any).details);
    } else {
        console.error("Unknown error:", error);
    }
  } finally {
    readline.close();
    await client.destroy(); // Release resources
    console.log("\nClient stopped. Session ended.");
  }
}

chatWithTaxiBot();
```

## ⚙️ API and Concepts

### `OpenRouterClient`

The main class for interacting with the library.

#### Configuration (`OpenRouterConfig`)

An object passed when creating the client (`new OpenRouterClient(config)`). Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `apiEndpoint?` (string): Override the chat completions API endpoint URL (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `model?` (string): Default model identifier for requests.
*   `debug?` (boolean): Enable detailed logging (default: `false`).
*   `proxy?` (string | object): HTTP/HTTPS proxy settings.
*   `referer?` (string): Value for the `HTTP-Referer` header.
*   `title?` (string): Value for the `X-Title` header.
*   `axiosConfig?` (object): Additional configuration passed directly to Axios.
*   `historyAdapter?` (IHistoryStorage): **Required for history management.** An instance of a history storage adapter (e.g., `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Time-to-live (TTL) for entries in the `UnifiedHistoryManager` cache (milliseconds).
*   `historyCleanupInterval?` (number): Interval for cleaning expired entries from the `UnifiedHistoryManager` cache (milliseconds).
*   `providerPreferences?` (object): Settings specific to OpenRouter model providers.
*   `modelFallbacks?` (string[]): List of fallback models to try if the primary model fails.
*   `responseFormat?` (ResponseFormat | null): Default response format for all requests.
*   `maxToolCalls?` (number): Default maximum tool call cycles per `chat()` invocation (default: 10).
*   `strictJsonParsing?` (boolean): Throw an error on invalid JSON response (if JSON format requested)? (default: `false`, returns `null`).
*   `security?` (SecurityConfig): Configuration for the security module (uses the base `SecurityConfig` type from `./types`).
*   `enableCostTracking?` (boolean): Enable cost tracking (default: `false`).
*   `priceRefreshIntervalMs?` (number): Interval for refreshing model prices (default: 6 hours).
*   `initialModelPrices?` (object): Provide initial model prices to avoid the first price fetch.
*   *Deprecated fields (ignored if `historyAdapter` is present):* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`.

#### Core Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: The primary method for sending chat requests. Takes an `options` object (see `OpenRouterRequestOptions` in `types/index.ts`). **Manages history only if `user` is passed AND `historyAdapter` is configured.**
*   `getHistoryManager(): UnifiedHistoryManager`: Returns the history manager instance (if created).
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager instance (if configured).
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker instance (if enabled).
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches the OpenRouter account credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cached model prices.
*   `refreshModelPrices(): Promise<void>`: Forces a background refresh of model prices.
*   `createAccessToken(userInfo, expiresIn?): string`: Generates a JWT (if `security.userAuthentication.type === 'jwt'`).
*   `use(plugin): Promise<void>`: Registers a plugin.
*   `useMiddleware(fn): void`: Registers middleware.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from client events (`'error'`) or security module events (prefixed events like `security:`, `user:`, `token:`, `access:`, `ratelimit:`, `tool:`).
*   `destroy(): Promise<void>`: Releases resources (timers, listeners).

### 🧩 Plugins and Middleware

*   **Plugins:** Modules extending client functionality. Registered via `client.use(plugin)`. Can initialize services, replace standard managers (`setSecurityManager`, `setCostTracker`), add middleware.
*   **Middleware:** Functions executed sequentially for each `client.chat()` call. Allow modification of requests (`ctx.request`), responses (`ctx.response`), or performing side effects (logging, auditing). Registered via `client.useMiddleware(fn)`.

### 📜 History Management (Adapters)

To enable automatic dialogue history management (loading, saving, trimming when `user` is passed to `client.chat()`), **you MUST configure `historyAdapter`** in `OpenRouterConfig`. Without it, history features will not work.

*   **Adapter (`IHistoryStorage`):** Defines the interface for storage (`load`, `save`, `delete`, `listKeys`, `destroy?`).
*   **`UnifiedHistoryManager`:** Internal component using the adapter and managing an in-memory cache (with TTL and cleanup).
*   **Built-in Adapters:**
    *   `MemoryHistoryStorage`: Stores history in RAM (default if no adapter specified).
    *   `DiskHistoryStorage`: Stores history in JSON files on disk.
*   **Usage:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage, DiskHistoryStorage } from 'openrouter-kit';

    // Using MemoryHistoryStorage
    const clientMemory = new OpenRouterClient({
      /*...,*/
      historyAdapter: new MemoryHistoryStorage()
    });

    // Using DiskHistoryStorage
    const clientDisk = new OpenRouterClient({
      /*...,*/
      historyAdapter: new DiskHistoryStorage('./my-chat-histories')
    });
    ```
*   **Redis Plugin:** Use `createRedisHistoryPlugin` for easy Redis integration (requires `ioredis`).
*   **Cache Settings:** `historyTtl`, `historyCleanupInterval` in `OpenRouterConfig` control the `UnifiedHistoryManager`'s cache behavior.

### 🛠️ Tool Handling (Function Calling)

Allows LLM models to invoke your JavaScript/TypeScript functions to retrieve external information, interact with other APIs, or perform real-world actions.

1.  **Defining a Tool (`Tool`):**
    Define each tool as an object conforming to the `Tool` interface. Key fields:
    *   `type: 'function'` (currently the only supported type).
    *   `function`: An object describing the function for the LLM:
        *   `name` (string): A unique name the model will use to call the function.
        *   `description` (string, optional): A clear description of what the function does and when to use it. **Crucial** for the model to understand the tool's purpose.
        *   `parameters` (object, optional): A [JSON Schema](https://json-schema.org/) object describing the structure, types, and required fields of the arguments your function expects. The library uses this schema to validate arguments received from the model. Omit if no arguments are needed.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Your async or sync function** that gets executed when the model requests this tool call.
        *   `args`: An object containing the arguments passed by the model, already parsed from the JSON string and (if a schema was provided) validated against `parameters`.
        *   `context?`: An optional `ToolContext` object containing additional call information, such as:
            *   `userInfo?`: The `UserAuthInfo` object for the authenticated user (if `SecurityManager` is used and `accessToken` was passed).
            *   `securityManager?`: The `SecurityManager` instance (if used).
    *   `security` (ToolSecurity, optional): An object defining tool-specific security rules like `requiredRole`, `requiredScopes`, or `rateLimit`. These are checked by the `SecurityManager` before `execute` is called.

2.  **Using in `client.chat()`:**
    *   Pass an array of your defined tools to the `tools` option of the `client.chat()` method.
    *   The library handles the complex interaction flow:
        1.  Sends tool definitions (name, description, parameters schema) to the model with your prompt.
        2.  If the model decides to call one or more tools, it returns a response with `finish_reason: 'tool_calls'` and a list of `tool_calls`.
        3.  The library intercepts this response. For each requested `toolCall`:
            *   Finds the corresponding tool in your `tools` array by name.
            *   Parses the arguments string (`toolCall.function.arguments`) into a JavaScript object.
            *   Validates the arguments object against the JSON Schema in `tool.function.parameters` (if provided).
            *   **Performs security checks** via `SecurityManager` (if configured): verifies user (`userInfo`) access rights, applies rate limits, and checks arguments for dangerous content.
            *   If all checks pass, calls your `tool.execute(parsedArgs, context)` function.
            *   Waits for the result (or catches errors) from your `execute` function.
            *   **Formats the result (or a structured error) into a JSON string** and sends it back to the model in a new message with `role: 'tool'` and the corresponding `tool_call_id`.
        4.  The model receives the tool call results and generates the final, coherent response to the user (now with `role: 'assistant'`).
    *   The `maxToolCalls` option (in `client.chat()` or client config) limits the maximum number of these request-call-result cycles to prevent infinite loops if the model keeps requesting tools.
    *   The `toolChoice` option controls the model's tool usage: `'auto'` (default), `'none'` (disallow calls), or force a specific function call `{ type: "function", function: { name: "my_tool_name" } }`.

3.  **Result:** The final model response (after all potential tool calls) is available in `ChatCompletionResult.content`. The `ChatCompletionResult.toolCallsCount` field indicates how many tools were successfully called and executed during the single `client.chat()` invocation.

### 🔒 Security Module (`SecurityManager`)

Provides multi-layered protection when using tools, crucial if tools perform actions or access data. Activated by passing a `security: SecurityConfig` object to the `OpenRouterClient` constructor.

**Components:**

*   `AuthManager`: Handles user authentication. Supports JWT out-of-the-box (generation, validation, caching). Uses `jwtSecret` from config. Extensible via `customAuthenticator`.
*   `AccessControlManager`: Checks if the authenticated (or anonymous, if allowed) user has permission to call a specific tool based on `security.toolAccess` and `security.roles` rules. Considers `defaultPolicy`.
*   `RateLimitManager`: Tracks and enforces tool call frequency limits per user based on configuration (`security.roles`, `security.toolAccess`, or `tool.security`). **Important:** Default implementation is in-memory and **not suitable for distributed systems.**
*   `ArgumentSanitizer`: Analyzes arguments passed to tool `execute` functions for potentially harmful patterns (SQLi, XSS, OS commands, etc.) using regex and blocklists defined in `security.dangerousArguments`. Supports blocking or audit-only (`auditOnlyMode`).

**Configuration (`SecurityConfig`):**

Defines the security module's behavior in detail. Uses extended types (`ExtendedSecurityConfig`, `ExtendedUserAuthInfo`, etc.) exported by the library. Key fields:

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): Action if no explicit access rule matches? `'deny-all'` recommended.
*   `requireAuthentication` (boolean): Must a valid `accessToken` be present for *any* tool call?
*   `allowUnauthenticatedAccess` (boolean): If `requireAuthentication: false`, can anonymous users call tools (if the tool itself allows it)?
*   `userAuthentication` (`UserAuthConfig`): Authentication method setup (`type: 'jwt'`, `jwtSecret`, `customAuthenticator`). **Set a strong `jwtSecret` if using JWT!**
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Access rules per tool name or for all (`'*'`). Includes `allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`.
*   `roles` (`RolesConfig`): Definitions of roles and their permissions/limits (`allowedTools`, `rateLimits`).
*   `dangerousArguments` (`ExtendedDangerousArgumentsConfig`): Argument sanitization settings (`globalPatterns`, `toolSpecificPatterns`, `blockedValues`, `auditOnlyMode`).

**Usage:**

1.  Pass the `securityConfig` object to the `OpenRouterClient` constructor.
2.  For authenticated requests, pass the access token via `client.chat({ accessToken: '...' })`.
3.  The library automatically calls `securityManager.checkToolAccessAndArgs()` before executing any tool. This performs all configured checks (auth, ACL, rate limits, args).
4.  If any check fails, an appropriate error (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`) is thrown, and the `execute` function is not called.
5.  Use `client.createAccessToken()` to generate JWTs (if configured).
6.  Subscribe to security events (`client.on('access:denied', ...)` etc.) for monitoring.

### 📈 Cost Tracking

Provides an **approximate** cost estimate for each `client.chat()` call based on token usage and OpenRouter model prices.

*   **Enabling:** Set `enableCostTracking: true` in `OpenRouterConfig`.
*   **Mechanism:**
    1.  `CostTracker` instance is created on client initialization.
    2.  It fetches current prices for all models from the OpenRouter API (`/models`) initially (unless `initialModelPrices` is provided) and periodically thereafter (`priceRefreshIntervalMs`, default 6 hours).
    3.  Prices (cost per million input/output tokens) are cached in memory.
    4.  After a successful `client.chat()` call, the library gets token usage (`usage`) from the API response.
    5.  `costTracker.calculateCost(model, usage)` is called, using cached prices and usage data to compute the cost. It accounts for prompt, completion, and intermediate tool call tokens.
    6.  The calculated value (USD number) or `null` (if prices are unknown or tracking is off) is added to the `cost` field of the returned `ChatCompletionResult`.
*   **Related Client Methods:**
    *   `getCreditBalance(): Promise<CreditBalance>`: Fetches current credit limit and usage from your OpenRouter account.
    *   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the current cache of model prices used by the tracker.
    *   `refreshModelPrices(): Promise<void>`: Manually triggers a background refresh of the model price cache.
    *   `getCostTracker(): CostTracker | null`: Accesses the `CostTracker` instance (if enabled).
*   **Accuracy:** Remember this is an **estimate**. Actual billing might differ slightly due to rounding or price changes not yet reflected in the cache.

### ⚙️ Response Format (`responseFormat`)

Instructs the model to generate its response content in JSON format, useful for structured data extraction.

*   **Configuration:** Set via the `responseFormat` option in `OpenRouterConfig` (for a default) or in the `client.chat()` options (for a specific request).
*   **Types:**
    *   `{ type: 'json_object' }`: Instructs the model to return any valid JSON object.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Requires the model to return JSON conforming to the provided JSON Schema.
        *   `name`: An arbitrary name for your schema.
        *   `schema`: The JSON Schema object describing the expected JSON structure.
        *   `strict` (optional): Request strict schema adherence (model-dependent).
        *   `description` (optional): A description of the schema for the model.
*   **Example:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

    const client = new OpenRouterClient({ /* ... */ historyAdapter: new MemoryHistoryStorage() });

    const userSchema = {
      type: "object",
      properties: { name: { type: "string"}, age: {type: "number"} },
      required: ["name", "age"]
    };

    async function getUserData() {
        const result = await client.chat({
          prompt: 'Generate JSON for a user: name Alice, age 30.',
          responseFormat: {
            type: 'json_schema',
            json_schema: { name: 'UserData', schema: userSchema }
          }
        });
        console.log(result.content); // Expect { name: "Alice", age: 30 }
    }
    ```
*   **Parsing Error Handling:**
    *   If `strictJsonParsing: false` (default): If the model returns invalid JSON or JSON not matching the schema, `ChatCompletionResult.content` will be `null`.
    *   If `strictJsonParsing: true`: A `ValidationError` will be thrown in the same situation.
*   **Model Support:** Not all models guarantee support for `responseFormat`. Check specific model documentation.

### ⚠️ Error Handling

The library uses a structured error system for easier debugging and control flow.

*   **Base Class `OpenRouterError`**: All library errors inherit from this. Contains:
    *   `message`: Human-readable error description.
    *   `code` (`ErrorCode`): String code for programmatic identification (e.g., `API_ERROR`, `VALIDATION_ERROR`, `RATE_LIMIT_ERROR`).
    *   `statusCode?` (number): HTTP status code from the API response, if applicable.
    *   `details?` (any): Additional context or the original error.
*   **Subclasses**: Specific error types for different situations:
    *   `APIError`: Error returned by the OpenRouter API (status >= 400).
    *   `ValidationError`: Data validation failure (config, args, JSON/schema response).
    *   `NetworkError`: Network issue connecting to the API.
    *   `AuthenticationError`: Invalid API key or missing authentication (typically 401).
    *   `AuthorizationError`: Invalid or expired access token (typically 401).
    *   `AccessDeniedError`: Authenticated user lacks permissions (typically 403).
    *   `RateLimitError`: Request limit exceeded (typically 429). Contains `details.timeLeft` (ms).
    *   `ToolError`: Error during tool `execute` function execution.
    *   `ConfigError`: Invalid library configuration.
    *   `SecurityError`: General security failure (includes `DANGEROUS_ARGS`).
    *   `TimeoutError`: API request timed out.
*   **Enum `ErrorCode`**: Contains all possible string error codes (e.g., `ErrorCode.API_ERROR`, `ErrorCode.TOOL_ERROR`).
*   **Function `mapError(error)`**: Internally used to convert Axios and standard `Error` objects into an `OpenRouterError` subclass. Exported for potential external use.
*   **Handling Recommendations**:
    *   Use `try...catch` blocks around client method calls (`client.chat()`, `client.getCreditBalance()`, etc.).
    *   Check error type using `instanceof` (e.g., `if (error instanceof RateLimitError)`) or the code (`if (error.code === ErrorCode.VALIDATION_ERROR)`).
    *   Inspect `error.statusCode` and `error.details` for more context.
    *   Subscribe to the global client `'error'` event (`client.on('error', handler)`) for centralized logging or monitoring of unexpected errors.

```typescript
import { OpenRouterClient, MemoryHistoryStorage, OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

const client = new OpenRouterClient({ /* ... */ historyAdapter: new MemoryHistoryStorage() });

async function safeChat() {
    try {
      const result = await client.chat({ prompt: "..." });
      // ... process successful result ...
    } catch (error: any) {
      if (error instanceof RateLimitError) {
        const retryAfter = Math.ceil((error.details?.timeLeft || 1000) / 1000); // Seconds
        console.warn(`Rate limit exceeded! Please try again in ${retryAfter} seconds.`);
      } else if (error.code === ErrorCode.VALIDATION_ERROR) {
        console.error(`Validation Error: ${error.message}`, error.details);
      } else if (error.code === ErrorCode.TOOL_ERROR && error.message.includes('Maximum tool call depth')) {
         console.error(`Tool call limit reached: ${error.message}`);
      } else if (error instanceof OpenRouterError) {
        console.error(`OpenRouter Kit Error (${error.code}, Status: ${error.statusCode || 'N/A'}): ${error.message}`);
        if(error.details) console.error('Details:', error.details);
      } else {
        console.error(`Unknown error: ${error.message}`);
      }
    }
}
```

### 📝 Logging

The library uses a built-in logger for debug information and event messages.

*   **Activation:** Set `debug: true` in `OpenRouterConfig` when creating the client.
*   **Levels:** Uses standard console levels: `console.debug`, `console.log`, `console.warn`, `console.error`. When `debug: false`, only critical initialization warnings or errors are shown.
*   **Prefixes:** Messages are automatically prefixed with the component source (e.g., `[OpenRouterClient]`, `[SecurityManager]`, `[CostTracker]`, `[UnifiedHistoryManager]`) for easier debugging.
*   **Customization:** While direct logger replacement isn't a standard API feature, you can pass custom loggers to some components (like `HistoryManager` if created manually) or use plugins/middleware to intercept and redirect logs.
*   **`isDebugMode()` Method:** Check the client's current debug status using `client.isDebugMode()`.

### 🌐 Proxy

Route requests to the OpenRouter API through an HTTP/HTTPS proxy using the `proxy` option in `OpenRouterConfig`.

*   **Formats:**
    *   **URL String:** Full proxy URL, including protocol, optional authentication, host, and port.
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
          port: 8888, // can also be '8888'
          user: 'proxyUser',
          pass: 'proxyPassword'
        }
        ```
*   **Mechanism:** The library uses `https-proxy-agent` to route HTTPS traffic through the specified HTTP/HTTPS proxy.

## 📄 License

[MIT](./LICENSE)