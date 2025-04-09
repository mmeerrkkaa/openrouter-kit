
# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies working with LLMs by providing an API for chats, history management, tool handling (function calling), and much more.

## 📦 Installation

```bash
npm install openrouter-kit
# or
yarn add openrouter-kit
# or
pnpm add openrouter-kit
```

## 🚀 Quick Start: Usage Examples

Here are a few examples to get you started quickly:

### 1. Simple Response Generation

The most basic example for sending a request and receiving a response from the model.

```typescript
// simple-chat.ts
import { OpenRouterClient } from 'openrouter-kit';

// Initialize the client with your API key
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: "google/gemini-2.0-flash-001" // Default model for all calls
});

async function main() {
  try {
    console.log('Sending a simple request...');
    const result = await client.chat({
      prompt: 'Write a short greeting for a README.',
      model: 'google/gemini-1-5', // Override the default model for this specific call
      temperature: 0.7,
    });

    console.log('--- Result ---');
    console.log('Model response:', result.content);
    console.log('Model used:', result.model);
    console.log('Tokens used:', result.usage);

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
  } finally {
    console.log('\nFinishing up...');
    // Release resources (timers, etc.)
    await client.destroy();
  }
}

main();
```

### 2. Dialog Example (with History Management)

To maintain conversation context, use `historyAdapter` and pass a `user` ID. The library will automatically load and save the history.

```typescript
// dialog-chat.ts
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // Use MemoryHistoryStorage to store history in memory
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true,
});

const userId = 'dialog-user-123'; // Unique ID for the user

async function runDialog() {
  try {
    // First message
    console.log(`[${userId}] You: Hi! What's your name?`);
    const result1 = await client.chat({
      user: userId, // <-- Pass the user ID for automatic history management
      prompt: "Hi! What's your name?",
      model: 'google/gemini-2.0-flash-001',
    });
    console.log(`[${userId}] Bot: ${result1.content}`);
    console.log(`(Cost: $${result1.cost?.toFixed(6) || 'N/A'})`);

    // Second message (model should remember the context)
    console.log(`\n[${userId}] You: What's the weather like today?`);
    const result2 = await client.chat({
      user: userId, // <-- Same user ID
      prompt: "What's the weather like today?",
      model: 'google/gemini-flash-1.5',
    });
    console.log(`[${userId}] Bot: ${result2.content}`);
    console.log(`(Cost: $${result2.cost?.toFixed(6) || 'N/A'})`);

    // Check the saved history
    const historyManager = client.getHistoryManager();
    const historyKey = `user:${userId}`; // Internal key format (subject to change)
    const history = await historyManager.getHistory(historyKey);
    console.log(`\nMessages saved in history for ${historyKey}: ${history.length}`);

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error code: ${error.code}`);
  } finally {
    console.log('\nFinishing dialog...');
    await client.destroy();
  }
}

runDialog();
```

### 3. Tool Usage Example (Tools / Function Calling)

This example shows how the model can use functions (tools) provided by you to retrieve external information. Here, the model first needs to get the user ID by nickname, and then request their messages.

```javascript
// tools-example.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");

const users = [
  { id: "user_1001", nick: "alice" },
  { id: "user_1002", nick: "bob" },
  { id: "user_1003", nick: "charlie" },
  { id: "user_1004", nick: "david" },
  { id: "user_1005", nick: "elena" }
];

const messages = [
  { id: "msg_101", userId: "user_1001", content: "1" },
  { id: "msg_102", userId: "user_1002", content: "2" },
  { id: "msg_103", userId: "user_1003", content: "3" },
  { id: "msg_104", userId: "user_1004", content: "4" },
  { id: "msg_105", userId: "user_1005", content: "5" },
  { id: "msg_106", userId: "user_1001", content: "6" },
  { id: "msg_107", userId: "user_1002", content: "7" }
];

const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Gets the user ID by their nickname",
      parameters: {
        type: "object",
        properties: {
          nick: { type: "string", description: "User's nickname" }
        },
        required: ["nick"]
      },
    },
    execute: async (args) => {
      console.log(`[getUserIdByNick] arguments ${args.nick}...`);
      const user = users.find(u => u.nick.toLowerCase() === args.nick.toLowerCase());
      if (user) {
        return { userId: user.id, nick: args.nick, found: true };
      } else {
        return { userId: null, nick: args.nick, found: false };
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getMessageById",
      description: "Gets the message text by ID",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "Message ID" }
        },
        required: ["messageId"]
      },
    },
    execute: async (args) => {
      console.log(`[getMessageById] arguments ${args.messageId}...`);
      const message = messages.find(m => m.id === args.messageId);
      if (message) {
        return {
          messageId: args.messageId,
          content: message.content,
          userId: message.userId,
          found: true
        };
      } else {
        return {
          messageId: args.messageId,
          content: "Message not found",
          userId: null,
          found: false
        };
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getUserMessages",
      description: "Gets all messages for a user by their ID",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User ID" }
        },
        required: ["userId"]
      },
    },
    execute: async (args) => {
      console.log(`[getUserMessages] arguments ${args.userId}...`);
      const userMessages = messages.filter(m => m.userId === args.userId);
      if (userMessages.length > 0) {
        return {
          userId: args.userId,
          messages: userMessages,
          count: userMessages.length,
          found: true
        };
      } else {
        return {
          userId: args.userId,
          messages: [],
          count: 0,
          found: false
        };
      }
    }
  }
];

const client = new OpenRouterClient({
  apiKey: "sk-or-v1-",
  model: "openrouter/quasar-alpha",
});

async function main() {
    const result = await client.chat({
        systemPrompt: 'You are a helpful assistant',
        prompt: 'what did alice write',
        tools: userTools,
        temperature: 0.5,
    });
    console.log(result.content);

    const result2 = await client.chat({
        systemPrompt: 'You are a helpful assistant',
        prompt: 'what did dasda write', // Note: "dasda" likely doesn't exist, testing not found case
        tools: userTools,
        temperature: 0.5,
    });
    console.log(result2.content);
}

main();

```

---

## 📚 Detailed Guide

Now that you've seen the basic examples, you can dive deeper into the library's capabilities.

### Table of Contents

*   [🌟 Why Use OpenRouter Kit?](#-why-use-openrouter-kit)
*   [🚀 Key Features](#-key-features)
*   [🚕 Example: Taxi Bot](#-example-taxi-bot)
*   [⚙️ API & Concepts](#️-api--concepts)
    *   [OpenRouterClient](#openrouterclient)
        *   [Configuration (OpenRouterConfig)](#configuration-openrouterconfig)
        *   [Main Methods](#main-methods)
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

### 🌟 Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, and tool handling are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Customize models, generation parameters, **history storage (requires adapter)**, security, and much more.
*   **Security:** A built-in security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the library's core.
*   **Reliability:** Fully typed with TypeScript, predictable error handling (including structured tool errors), and resource management.

### 🚀 Key Features

*   **🤖 Universal Chat:** A simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
    *   Returns a structured `ChatCompletionResult` object with content (`content`), token usage information (`usage`), model (`model`), number of tool calls (`toolCallsCount`), finish reason (`finishReason`), execution time (`durationMs`), request ID (`id`), and **calculated cost** (`cost`, optional).
*   **📜 History Management (via Adapters):** **Requires `historyAdapter` configuration**. Automatic loading, saving, and (potentially) trimming of dialog history for each user or group if `user` is passed to `client.chat()`.
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Includes adapters for memory (`MemoryHistoryStorage`) and disk (`DiskHistoryStorage`, JSON files). Exported from the main module.
    *   Easily connect your own adapters (Redis, MongoDB, API, etc.) or use a ready-made plugin (`createRedisHistoryPlugin`).
    *   Configure cache TTL and cleanup intervals via client options (`historyTtl`, `historyCleanupInterval`). History limit management is delegated to the adapter.
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for calling your functions from the model.
    *   Define tools using the `Tool` interface and JSON Schema for argument validation.
    *   Automatic argument parsing, schema validation, and **security checks**.
    *   Execution of your `execute` functions with context (`ToolContext`, including `userInfo`).
    *   Automatic sending of results back to the model to get the final response.
    *   **Structured Tool Error Handling:** Errors occurring during parsing, validation, security checks, or tool execution are formatted as a JSON string (`{"errorType": "...", "errorMessage": "...", "details": ...}`) and passed to the model in a `role: 'tool'` message, potentially allowing the LLM to better understand and react to the problem.
    *   Configurable limit on the maximum number of tool call rounds (`maxToolCalls`) to prevent infinite loops.
*   **🛡️ Security Module:** Comprehensive and configurable protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching) via `AuthManager`. Easily extensible for other methods (`api-key`, `custom`).
    *   **Access Control (ACL):** Flexible configuration of tool access (`AccessControlManager`) based on roles (`roles`), API keys (`allowedApiKeys`), permissions (`scopes`), or explicit rules (`allow`/`deny`). Default policy (`deny-all`/`allow-all`).
    *   **Rate Limiting:** Apply limits (`RateLimitManager`) to tool calls for users or roles, with configurable periods and limits. **Important:** The standard `RateLimitManager` implementation stores state in memory and **is not suitable for distributed systems** (multiple processes/servers). Such scenarios require a custom adapter or plugin using external storage (e.g., Redis).
    *   **Argument Sanitization:** Checks (`ArgumentSanitizer`) tool arguments for potentially dangerous patterns (SQLi, XSS, command injection, etc.) with global, tool-specific, and custom rules. Supports audit-only mode (`auditOnlyMode`).
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, `token:invalid`, `user:authenticated`, etc.) for monitoring and logging.
*   **📈 Cost Tracking:** (Optional)
    *   Automatic calculation of the approximate cost of each `chat()` call based on token usage (`usage`) and OpenRouter model prices.
    *   Periodic background updates of model prices from the OpenRouter API (`/models`).
    *   `getCreditBalance()` method to check the current OpenRouter credit balance.
    *   Access cached prices via `getModelPrices()`.
*   **⚙️ Flexible Configuration:** Configure API key, default model, endpoint (`apiEndpoint` for chat, base URL for other requests determined automatically), timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limit (`maxToolCalls`), cost tracking (`enableCostTracking`), **history adapter (`historyAdapter`)**, and many other parameters via `OpenRouterConfig`.
*   **💡 Typing:** Fully written in TypeScript, providing strong typing, autocompletion, and type checking during development.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, `ToolError`, `ConfigError`, etc.), inheriting from `OpenRouterError`, with codes (`ErrorCode`) and details for convenient handling. `mapError` function for error normalization.
*   **📝 Logging:** Built-in flexible logger (`Logger`) with prefix support and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API hiding the complexity of underlying LLM interactions, history, and tools.
*   **🧹 Resource Management:** `client.destroy()` method for correctly releasing resources (cleanup timers, caches, event handlers), preventing leaks in long-running applications.
*   **🧩 Plugin System:** Extend client capabilities without modifying the core.
    *   Support for connecting external and custom plugins via `client.use(plugin)`.
    *   Plugins can add middleware, replace managers (history, security, cost), subscribe to events, and extend the client API.
*   **🔗 Middleware Chain:** Flexible processing of requests and responses before and after the API call.
    *   Add middleware functions via `client.useMiddleware(fn)`.
    *   Middleware can modify requests (`ctx.request`), responses (`ctx.response`), implement auditing, access control, logging, cost limiting, caching, and more.

### 🚕 Example: Taxi Bot

This example demonstrates using conversation history and tool calls. **Note the mandatory inclusion of `historyAdapter` and the corresponding `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001", // Use an up-to-date model
  historyAdapter: new MemoryHistoryStorage(), // Mandatory for history
  enableCostTracking: true,
  debug: false, // Set to true for detailed logs
  // security: { /* ... */ } // Security configuration can be added here
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
          from: { type: "string", description: "Departure address (e.g., '1 Lenin St, Moscow')" },
          to: { type: "string", description: "Destination address (e.g., '10 Tverskaya St, Moscow')" }
        },
        required: ["from", "to"]
      },
    },
    execute: async (args) => {
      console.log(`[Tool estimateRideCost] Calculating cost from ${args.from} to ${args.to}...`);
      const cost = Math.floor(Math.random() * 900) + 100; // Simulate cost calculation
      console.log(`[Tool estimateRideCost] Calculated cost: ${cost} RUB`);
      return { estimatedCost: cost, currency: "RUB" };
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Accepts and confirms the taxi order, assigns a driver.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Confirmed departure address" },
          to: { type: "string", description: "Confirmed destination address" },
          estimatedCost: { type: "number", description: "Approximate ride cost (if known)"}
        },
        required: ["from", "to"]
      },
    },
    execute: async (args, context) => {
      console.log(`[Tool acceptOrder] Accepting order from ${args.from} to ${args.to}...`);
      console.log(`[Tool acceptOrder] Order initiated by user: ${context?.userInfo?.userId || 'anonymous'}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1; // Simulate driver assignment
      orderAccepted = true; // Set the flag to end the loop
      return `Order successfully accepted! Driver #${driverNumber} assigned and will arrive shortly at ${args.from}. Destination: ${args.to}.`;
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

const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your task is to help the customer order a taxi.
1. Clarify the departure address ('from') and destination address ('to') if the customer hasn't provided them. Be polite.
2. Once the addresses are known, MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm that they accept the cost and are ready to order (e.g., with words like "order it", "okay", "yes", "sounds good").
4. After customer confirmation, use the 'acceptOrder' tool, passing it the 'from' and 'to' addresses.
5. After calling 'acceptOrder', inform the customer of the result returned by the tool.
6. Do not invent driver numbers or order statuses yourself; rely on the response from the 'acceptOrder' tool.
7. If the user asks something unrelated to ordering a taxi, politely guide them back to the topic.`;

async function chatWithTaxiBot() {
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nBot Kit: Hello! I'm your virtual assistant... (Session ID: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
          console.log("Bot Kit: Thanks for contacting us! Goodbye.");
          break;
      }

      console.log("Bot Kit: One moment, processing your request...");
      const result = await client.chat({
        user: userId, // Key for history
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Pass the available tools
        temperature: 0.5,
        maxToolCalls: 5 // Limit the number of tool call cycles
      });

      // Output the assistant's final response
      console.log(`\nBot Kit: ${result.content}\n`);

      // Output debug information if enabled
      if (client.isDebugMode()) {
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
      }

      // Check the flag set by the acceptOrder tool
      if (orderAccepted) {
        console.log("Bot Kit: If you have any more questions, I'm here to help!");
        // A break can be added here if the dialog should end after the order
      }
    }
  } catch (error: any) {
    console.error("\n--- An Error Occurred ---");
    if (error instanceof Error) {
        console.error(`Type: ${error.constructor.name}`);
        console.error(`Message: ${error.message}`);
        if ((error as any).code) console.error(`Code: ${(error as any).code}`);
        if ((error as any).statusCode) console.error(`Status: ${(error as any).statusCode}`);
        if ((error as any).details) console.error(`Details:`, (error as any).details);
    } else {
        console.error("Unknown error:", error);
    }
  } finally {
    readline.close();
    await client.destroy(); // Release resources
    console.log("\nClient stopped. Session finished.");
  }
}

chatWithTaxiBot();
```

### ⚙️ API & Concepts

#### `OpenRouterClient`

The main class for interacting with the library.

##### Configuration (`OpenRouterConfig`)

A configuration object is passed when creating the client (`new OpenRouterClient(config)`). Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `apiEndpoint?` (string): The URL endpoint for chat completions (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `model?` (string): The default model for requests.
*   `debug?` (boolean): Enable detailed logging (default: `false`).
*   `proxy?` (string | object): HTTP/HTTPS proxy settings.
*   `referer?` (string): Value for the `HTTP-Referer` header.
*   `title?` (string): Value for the `X-Title` header.
*   `axiosConfig?` (object): Additional configuration for Axios.
*   `historyAdapter?` (IHistoryStorage): **Required for using history.** An instance of a history storage adapter (e.g., `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Time-to-live (TTL) for entries in the `UnifiedHistoryManager` cache (in milliseconds).
*   `historyCleanupInterval?` (number): Interval for cleaning up expired entries from the `UnifiedHistoryManager` cache (in milliseconds).
*   `providerPreferences?` (object): Settings specific to OpenRouter model providers.
*   `modelFallbacks?` (string[]): List of fallback models to try if the primary one fails.
*   `responseFormat?` (ResponseFormat | null): Default response format.
*   `maxToolCalls?` (number): Maximum number of tool call cycles per `chat()` call (default: 10).
*   `strictJsonParsing?` (boolean): Throw an error on invalid JSON in the response (if JSON format is requested)? (default: `false`, returns `null`).
*   `security?` (SecurityConfig): Configuration for the security module (uses the base `SecurityConfig` type from `./types`).
*   `enableCostTracking?` (boolean): Enable cost tracking (default: `false`).
*   `priceRefreshIntervalMs?` (number): Interval for refreshing model prices (default: 6 hours).
*   `initialModelPrices?` (object): Initial model prices to avoid the first price request.
*   *Deprecated fields (ignored if `historyAdapter` is present):* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`.

##### Main Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: The main method for sending a chat request. Accepts an `options` object with request parameters (see `OpenRouterRequestOptions` in `types/index.ts`). **Manages history only if `user` is passed and `historyAdapter` is configured.**
*   `getHistoryManager(): UnifiedHistoryManager`: Returns the history manager instance (if created).
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager instance (if configured).
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker instance (if enabled).
*   `getCreditBalance(): Promise<CreditBalance>`: Requests the OpenRouter credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cache of model prices.
*   `refreshModelPrices(): Promise<void>`: Force-refreshes the price cache.
*   `createAccessToken(userInfo, expiresIn?): string`: Generates a JWT (if `security.userAuthentication.type === 'jwt'`).
*   `use(plugin): Promise<void>`: Registers a plugin.
*   `useMiddleware(fn): void`: Registers middleware.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from client events (`'error'`) or security module events (events with prefixes `security:`, `user:`, `token:`, `access:`, `ratelimit:`, `tool:`).
*   `destroy(): Promise<void>`: Releases resources (timers, listeners).

#### 🧩 Plugins and Middleware

*   **Plugins:** Modules that extend client functionality. Registered via `client.use(plugin)`. Can initialize services, replace standard managers (`setSecurityManager`, `setCostTracker`), add middleware.
*   **Middleware:** Functions executed sequentially for each `client.chat()` call. Allow modifying the request (`ctx.request`), response (`ctx.response`), or performing side effects (logging, auditing). Registered via `client.useMiddleware(fn)`.

#### 📜 History Management (Adapters)

For automatic dialog history management (loading, saving, trimming when `user` is passed to `client.chat()`), **you must configure `historyAdapter`** in `OpenRouterConfig`. Without it, the history functionality will not work.

*   **Adapter (`IHistoryStorage`):** Defines the interface for storage (`load`, `save`, `delete`, `listKeys`, `destroy?`).
*   **`UnifiedHistoryManager`:** An internal component that uses the adapter and manages in-memory caching (with TTL and cleanup).
*   **Built-in Adapters:**
    *   `MemoryHistoryStorage`: Stores history in RAM.
    *   `DiskHistoryStorage`: Stores history in JSON files on disk.
*   **Connection:**
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
*   **Redis Plugin:** Use `createRedisHistoryPlugin` for easy integration with Redis (requires `ioredis`).
*   **Cache Settings:** `historyTtl`, `historyCleanupInterval` in `OpenRouterConfig` control the cache behavior in `UnifiedHistoryManager`.

#### 🛠️ Tool Handling (Function Calling)

Allows LLM models to call your own JavaScript/TypeScript functions to retrieve external information, interact with other APIs, or perform real-world actions.

1.  **Defining a Tool (`Tool`):**
    You define each tool as an object conforming to the `Tool` interface. Key fields:
    *   `type: 'function'` (the only currently supported type).
    *   `function`: An object describing the function for the LLM:
        *   `name` (string): A unique name for the function that the model will use to call it.
        *   `description` (string, optional): A clear description of what the function does and when it should be used. This is **very important** for the model to correctly understand the tool's purpose.
        *   `parameters` (object, optional): A [JSON Schema](https://json-schema.org/) describing the structure, types, and required fields of the arguments your function expects. The library uses this schema to validate arguments received from the model. If no arguments are needed, this field can be omitted.
    *   `execute: (args: any, context?: ToolContext) => Promise<any> | any`: **Your asynchronous or synchronous function** that will be executed when the model requests to call this tool.
        *   `args`: An object containing the arguments passed by the model, already parsed from the JSON string and (if a schema is provided) validated against `parameters`.
        *   `context?`: An optional `ToolContext` object containing additional information about the call, such as:
            *   `userInfo?`: A `UserAuthInfo` object with data about the authenticated user (if `SecurityManager` is used and `accessToken` is passed).
            *   `securityManager?`: The `SecurityManager` instance (if used).
    *   `security` (ToolSecurity, optional): An object to define tool-specific security rules, such as `requiredRole`, `requiredScopes`, or `rateLimit`. These rules are checked by the `SecurityManager` before calling `execute`.

2.  **Using in `client.chat()`:**
    *   Pass an array of your defined tools to the `tools` option of the `client.chat()` method.
    *   The library handles the complex interaction process:
        1.  Sends the tool definitions (name, description, parameter schema) to the model along with your prompt.
        2.  If the model decides it needs to call one or more tools to respond, it returns a response with `finish_reason: 'tool_calls'` and a list of `tool_calls`.
        3.  The library intercepts this response. For each requested call (`toolCall`):
            *   Finds the corresponding tool in your `tools` array by name.
            *   Parses the argument string (`toolCall.function.arguments`) into a JavaScript object.
            *   Validates the resulting argument object against the JSON Schema specified in `tool.function.parameters` (if provided).
            *   **Performs security checks** via `SecurityManager` (if configured): verifies the user's (`userInfo`) access rights to this tool, applies rate limits, and checks arguments for dangerous content.
            *   If all checks pass, calls your function `tool.execute(parsedArgs, context)`.
            *   Waits for the result (or catches an error) from your `execute` function.
            *   **Formats the result (or a structured error) into a JSON string** and sends it back to the model in a new message with `role: 'tool'` and `tool_call_id`.
        4.  The model receives the results of the tool calls and generates the final, meaningful response to the user (now with `role: 'assistant'`).
    *   The `maxToolCalls` option in `client.chat()` or the client configuration limits the maximum number of these "request-call-result" cycles to prevent infinite loops if the model repeatedly requests tools.
    *   The `toolChoice` option allows controlling the model's tool selection: `'auto'` (default), `'none'` (disallow calls), or force a specific function call `{ type: "function", function: { name: "my_tool_name" } }`.

3.  **Result:** The model's final response (after all possible tool calls) will be available in the `ChatCompletionResult.content` field. The `ChatCompletionResult.toolCallsCount` field will indicate how many times tools were successfully called and executed within a single `client.chat()` call.

#### 🔒 Security Module (`SecurityManager`)

Provides multi-layered protection when using tools, which is especially important if tools can perform actions or access data. Activated by passing a `security: SecurityConfig` object to the `OpenRouterClient` constructor.

**Components:**

*   `AuthManager`: Responsible for user authentication. Supports JWT by default. Generates (`createAccessToken`) and validates (`authenticateUser`) tokens. Uses `jwtSecret` from the configuration. Can be extended for other methods via `customAuthenticator`.
*   `AccessControlManager`: Checks if an authenticated user (or an anonymous user, if allowed) has permission to call a specific tool. Uses rules from `security.toolAccess` and `security.roles`. Considers the `defaultPolicy`.
*   `RateLimitManager`: Tracks and enforces rate limits for tool calls per user. Finds the relevant limit in the configuration (`security.roles`, `security.toolAccess`, or `tool.security`). **Important:** The standard implementation stores state in memory and **is not suitable for distributed systems**.
*   `ArgumentSanitizer`: Analyzes arguments passed to tool `execute` functions for potentially dangerous strings or patterns (e.g., SQL injection attempts, XSS, OS commands). Uses regular expressions and blocklists from `security.dangerousArguments`. Can operate in blocking or audit-only mode (`auditOnlyMode`).

**Configuration (`SecurityConfig`):**

Defines the security module's behavior in detail. Uses extended types (`ExtendedSecurityConfig`, `ExtendedUserAuthInfo`, etc.) exported from the library. Key fields:

*   `defaultPolicy` (`'deny-all'` | `'allow-all'`): What to do if there's no explicit access rule for a tool? `'deny-all'` is recommended.
*   `requireAuthentication` (boolean): Require a valid `accessToken` for *any* tool call?
*   `allowUnauthenticatedAccess` (boolean): If `requireAuthentication: false`, allow anonymous users to call tools (if the tool has `allow: true` without specific roles/scopes)?
*   `userAuthentication` (`UserAuthConfig`): Configuration for the authentication method (`type: 'jwt'`, `jwtSecret`, `customAuthenticator`). **Critically important to set a strong `jwtSecret` if using JWT!**
*   `toolAccess` (`Record<string, ToolAccessConfig>`): Access rules for specific tools (by name) or for all (`'*'`). Includes `allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`.
*   `roles` (`RolesConfig`): Definition of roles and their privileges (`allowedTools`, `rateLimits`).
*   `dangerousArguments` (`ExtendedDangerousArgumentsConfig`): Configuration for argument sanitization (`globalPatterns`, `toolSpecificPatterns`, `blockedValues`, `auditOnlyMode`).

**Usage:**

1.  Pass the `securityConfig` object to the `OpenRouterClient` constructor.
2.  For authenticated requests, pass the access token in `client.chat({ accessToken: '...' })`.
3.  When a tool is called, the library automatically invokes `securityManager.checkToolAccessAndArgs()`, which performs all necessary checks (authentication, authorization, limits, arguments).
4.  If rules are violated, a corresponding error (`AuthorizationError`, `AccessDeniedError`, `RateLimitError`, `SecurityError`) will be thrown, and the `execute` call will not occur.
5.  Use `client.createAccessToken()` to generate JWTs (if configured).
6.  Subscribe to security events (`client.on('access:denied', ...)` etc.) for monitoring and response.

#### 📈 Cost Tracking

Allows obtaining an **approximate** estimate of the cost for each `client.chat()` call based on token usage data and OpenRouter model prices.

*   **Enabling:** Set `enableCostTracking: true` in `OpenRouterConfig`.
*   **Mechanism:**
    1.  When the client initializes, a `CostTracker` instance is created.
    2.  `CostTracker` requests the current prices for all available models from the OpenRouter API endpoint `/models`. This happens on startup (unless `initialModelPrices` are provided) and then periodically (interval set by `priceRefreshIntervalMs`, default 6 hours).
    3.  The retrieved prices (cost per million input and output tokens) are cached in memory.
    4.  After each successful `client.chat()` call, the library gets the token usage information (`usage`) from the API response.
    5.  `costTracker.calculateCost(model, usage)` is called, using the cached prices for the used model and the `usage` data to calculate the cost. It considers tokens for both the prompt and the response, as well as tokens spent during tool calls (if any).
    6.  The calculated value (a number in USD) or `null` (if prices for the model are unknown or tracking is disabled) is added to the `cost` field of the returned `ChatCompletionResult` object.
*   **Related Client Methods:**
    *   `getCreditBalance(): Promise<CreditBalance>`: Requests the current credit limit and usage from your OpenRouter account.
    *   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the current cache of model prices used by the tracker.
    *   `refreshModelPrices(): Promise<void>`: Forcibly triggers a background update of the model price cache.
    *   `getCostTracker(): CostTracker | null`: Provides access to the `CostTracker` instance (if enabled).
*   **Accuracy:** Keep in mind that this is an **estimate**. The actual cost might differ slightly due to rounding or changes in OpenRouter's pricing policy not yet reflected in the cache.

#### ⚙️ Response Format (`responseFormat`)

Allows instructing the model that the response should be generated in JSON format. This can be useful for obtaining structured data.

*   **Configuration:** Set via the `responseFormat` option in `OpenRouterConfig` (for the default response) or in the `options` of the `client.chat()` method (for a specific request).
*   **Types:**
    *   `{ type: 'json_object' }`: Instructs the model to return any valid JSON object.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Requires the model to return JSON conforming to the provided JSON Schema.
        *   `name`: An arbitrary name for your schema.
        *   `schema`: The JSON Schema object describing the expected JSON structure.
        *   `strict` (optional): Require strict adherence to the schema (if supported by the model).
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
        console.log(result.content); // Expecting { "name": "Alice", "age": 30 }
        // Note: Actual output might be a string needing JSON.parse() depending on model and strictness
    }
    ```
*   **Parsing Error Handling:**
    *   If client option `strictJsonParsing: false` (default): If the model returns invalid JSON or JSON not matching the schema, the `ChatCompletionResult.content` field will be `null`.
    *   If client option `strictJsonParsing: true`: In the same situation, a `ValidationError` will be thrown.
*   **Model Support:** Not all models guarantee support for `responseFormat`. Check the specific model's documentation.

#### ⚠️ Error Handling

The library provides a structured error handling system to simplify debugging and control flow management.

*   **Base Class `OpenRouterError`**: All library errors inherit from this. Contains:
    *   `message`: Human-readable error description.
    *   `code` (`ErrorCode`): String code for programmatic identification of the error type (e.g., `API_ERROR`, `VALIDATION_ERROR`, `RATE_LIMIT_ERROR`).
    *   `statusCode?` (number): HTTP status code from the API response, if applicable.
    *   `details?` (any): Additional data or the original error.
*   **Subclasses**: Specific subclasses are used for particular situations, such as:
    *   `APIError`: Error returned by the OpenRouter API (status >= 400).
    *   `ValidationError`: Data validation error (config, arguments, JSON/schema response).
    *   `NetworkError`: Network issue connecting to the API.
    *   `AuthenticationError`: Problem with the API key (usually 401).
    *   `AuthorizationError`: Invalid or expired access token (usually 401).
    *   `AccessDeniedError`: User authenticated but lacks permissions (usually 403).
    *   `RateLimitError`: Request limit exceeded (usually 429). Contains `details.timeLeft` (ms).
    *   `ToolError`: Error during the execution of a tool's `execute` function.
    *   `ConfigError`: Incorrect library configuration.
    *   `SecurityError`: General security error (including `DANGEROUS_ARGS`).
    *   `TimeoutError`: API response timeout exceeded.
*   **`ErrorCode` Enum**: Contains all possible string error codes (`ErrorCode.API_ERROR`, `ErrorCode.TOOL_ERROR`, etc.).
*   **`mapError(error)` Function**: Used internally to convert Axios errors and standard `Error` objects into `OpenRouterError`. Exported for potential use.
*   **Handling Recommendations**:
    *   Use `try...catch` blocks around client method calls (`client.chat()`, `client.getCreditBalance()`, etc.).
    *   Check the error type using `instanceof` (e.g., `if (error instanceof RateLimitError)`) or by code (`if (error.code === ErrorCode.VALIDATION_ERROR)`).
    *   Analyze `error.statusCode` and `error.details` for context.
    *   Subscribe to the global `'error'` client event (`client.on('error', handler)`) for centralized logging or tracking of unexpected errors.

```typescript
import { OpenRouterClient, MemoryHistoryStorage, OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

const client = new OpenRouterClient({ /* ... */ historyAdapter: new MemoryHistoryStorage() });

async function safeChat() {
    try {
      const result = await client.chat({ prompt: "..." });
      // ... handle successful result ...
    } catch (error: any) {
      if (error instanceof RateLimitError) {
        const retryAfter = Math.ceil((error.details?.timeLeft || 1000) / 1000); // Seconds
        console.warn(`Rate limit exceeded! Try again in ${retryAfter} sec.`);
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
    } finally {
        await client.destroy();
    }
}
```

#### 📝 Logging

The library uses a built-in logger to output debug information and event messages.

*   **Activation:** Set `debug: true` in `OpenRouterConfig` when creating the client.
*   **Levels:** Uses standard console levels: `console.debug`, `console.log`, `console.warn`, `console.error`. In `debug: false` mode, only critical warnings or initialization errors are output.
*   **Prefixes:** Messages are automatically prefixed indicating the library component (e.g., `[OpenRouterClient]`, `[SecurityManager]`, `[CostTracker]`, `[UnifiedHistoryManager]`), aiding debugging.
*   **Customization:** While direct logger replacement isn't provided via the standard API, you can pass your logger to some components (like `HistoryManager` if created manually) or use plugins/middleware to intercept and redirect logs.
*   **`isDebugMode()` Method:** Allows checking the current state of the client's debug mode (`client.isDebugMode()`).

#### 🌐 Proxy

To route requests to the OpenRouter API through an HTTP/HTTPS proxy, use the `proxy` option in `OpenRouterConfig`.

*   **Formats:**
    *   **URL String:** Full proxy URL, including protocol, optional authentication, host, and port.
        ```typescript
        proxy: 'http://user:password@proxy.example.com:8080'
        ```
        ```typescript
        proxy: 'https://secureproxy.com:9000'
        ```
    *   **Object:** Structured object with fields:
        *   `host` (string, **required**): Proxy server host.
        *   `port` (number | string, **required**): Proxy server port.
        *   `user?` (string, optional): Username for proxy authentication.
        *   `pass?` (string, optional): Password for proxy authentication.
        ```typescript
        proxy: {
          host: '192.168.1.100',
          port: 8888,
          user: 'proxyUser',
          pass: 'proxyPassword'
        }
        ```
*   **Mechanism:** The library uses `https-proxy-agent` to route HTTPS traffic through the specified HTTP/HTTPS proxy.

### 📄 License

[MIT](./LICENSE)