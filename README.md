# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and convenient TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies working with LLMs by providing a unified API for chats, history management, tool handling (function calling), request routing, web search, reasoning tokens, and much more.

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

The most basic example for sending a request and receiving a response from a model.

```typescript
// simple-chat.ts
import { OpenRouterClient } from 'openrouter-kit';

// Initialize the client with your API key
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: "google/gemini-flash-1.5" // Default model for all calls
});

async function main() {
  try {
    console.log('Sending a simple request...');
    const result = await client.chat({
      prompt: 'Write a short greeting for a README.',
      model: 'openai/gpt-4o-mini', // Override the model for this call
      temperature: 0.7,
    });

    console.log('--- Result ---');
    console.log('Model Response:', result.content);
    console.log('Model Used:', result.model);
    console.log('Tokens Used:', result.usage);

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
  } finally {
    console.log('\nShutting down...');
    // Release resources (timers, etc.)
    await client.destroy();
  }
}

main();
```

### 2. Dialog Example (with History Management)

To maintain dialog context, use `historyAdapter` and pass a `user` ID. The library will automatically load and save the history.

```typescript
// dialog-chat.ts
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // Use MemoryHistoryStorage to store history in memory
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Enable cost calculation
  model: "google/gemini-flash-1.5"
});

const userId = 'dialog-user-123'; // Unique ID for the user

async function runDialog() {
  try {
    // First message
    console.log(`[${userId}] You: Hi! What's your name?`);
    const result1 = await client.chat({
      user: userId, // <-- Pass the user ID for automatic history management
      prompt: "Hi! What's your name?",
    });
    console.log(`[${userId}] Bot: ${result1.content}`);
    console.log(`(Cost: $${result1.cost?.toFixed(6) || 'N/A'})`);

    // Second message (model should remember the context)
    console.log(`\n[${userId}] You: What's the weather like today?`);
    const result2 = await client.chat({
      user: userId, // <-- Same user ID
      prompt: "What's the weather like today?",
    });
    console.log(`[${userId}] Bot: ${result2.content}`);
    console.log(`(Cost: $${result2.cost?.toFixed(6) || 'N/A'})`);

    // Check the saved history
    const historyManager = client.getHistoryManager();
    // Internal key format depends on _getHistoryKey implementation
    const historyKey = `user:${userId.replace(/[:/\\?#%]/g, '_')}`;
    const history = await historyManager.getHistory(historyKey);
    console.log(`\nMessages saved in history for ${historyKey}: ${history.length}`);

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
  } finally {
    console.log('\nEnding dialog...');
    await client.destroy();
  }
}

runDialog();
```

### 3. Tool Usage Example (Tools / Function Calling)

This example shows how the model can use functions (tools) you provide to retrieve external information.

```javascript
// tools-example.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");

// --- Example Data (replace with your actual data sources) ---
const users = [ { id: "user_1001", nick: "alice" }, /* ... */ ];
const messages = [ { id: "msg_101", userId: "user_1001", content: "Hello!" }, /* ... */ ];
// ---

// --- Tool Definitions ---
const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Gets the user ID by their nickname",
      parameters: { /* ... argument schema ... */ },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserIdByNick] Args: ${JSON.stringify(args)}`);
      const user = users.find(u => u.nick.toLowerCase() === args.nick.toLowerCase());
      return user ? { userId: user.id, found: true } : { userId: null, found: false };
    }
  },
  {
    type: "function",
    function: {
      name: "getUserMessages",
      description: "Gets all messages for a user by their ID",
      parameters: { /* ... argument schema ... */ },
    },
    execute: async (args) => {
      console.log(`[Tool Execute: getUserMessages] Args: ${JSON.stringify(args)}`);
      const userMessages = messages.filter(m => m.userId === args.userId);
      return { messages: userMessages, count: userMessages.length, found: userMessages.length > 0 };
    }
  }
];
// ---

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "openai/gpt-4o-mini", // A model that supports tools
});

async function main() {
  try {
    const promptAlice = "Find all messages from user alice.";
    console.log(`\nRequest: "${promptAlice}"`);
    const resultAlice = await client.chat({
      prompt: promptAlice,
      tools: userTools,
      temperature: 0.5, // Lower temperature for predictable tool calls
    });
    console.log(`Response:\n${resultAlice.content}`);
    console.log(`(Tool Calls: ${resultAlice.toolCallsCount})`);

    const promptNonExistent = "What did user nonexistent_user write?";
    console.log(`\nRequest: "${promptNonExistent}"`);
    const resultNonExistent = await client.chat({
      prompt: promptNonExistent,
      tools: userTools,
      temperature: 0.1,
    });
    console.log(`Response:\n${resultNonExistent.content}`);
    console.log(`(Tool Calls: ${resultNonExistent.toolCallsCount})`);

  } catch (error) {
    console.error("\n--- Error ---");
    console.error(error);
  } finally {
    await client.destroy();
  }
}

main();
```

---

## 📚 Detailed Guide

Now that you've seen the basic examples, you can dive deeper into the library's capabilities.

### Contents

*   [🌟 Why Use OpenRouter Kit?](#-why-use-openrouter-kit)
*   [🚀 Key Features](#-key-features)
*   [🚕 Example: Taxi Bot](#-example-taxi-bot)
*   [⚙️ API and Concepts](#️-api-and-concepts)
    *   [OpenRouterClient](#openrouterclient)
        *   [Configuration (OpenRouterConfig)](#configuration-openrouterconfig)
        *   [Core Methods](#core-methods)
        *   [`client.chat` Request Options (OpenRouterRequestOptions)](#clientchat-request-options-openrouterrequestoptions)
        *   [`client.chat` Result (ChatCompletionResult)](#clientchat-result-chatcompletionresult)
    *   [Plugins and Middleware](#-plugins-and-middleware)
    *   [History Management (Adapters)](#-history-management-adapters)
    *   [Tool Handling (Function Calling)](#-tool-handling-function-calling)
    *   [Security Module (SecurityManager)](#-security-module-securitymanager)
    *   [Cost Tracking](#-cost-tracking)
    *   [Routing (Models and Providers)](#-routing-models-and-providers)
    *   [Web Search](#-web-search)
    *   [Reasoning Tokens](#-reasoning-tokens)
    *   [Response Format (responseFormat and Structured Outputs)](#️-response-format-responseformat-and-structured-outputs)
    *   [Error Handling](#️-error-handling)
    *   [Logging](#-logging)
    *   [Proxy](#-proxy)
*   [📄 License](#-license)

### 🌟 Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, tool handling, and routing are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, **history storage (requires adapter)**, security, provider/model routing, and much more, both globally and per request.
*   **Security:** The built-in security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the library core.
*   **Reliability:** Fully typed with TypeScript, predictable error handling (including structured tool errors), and resource management.
*   **Modern Features:** Support for web search, reasoning tokens, structured outputs, and other OpenRouter API capabilities.

### 🚀 Key Features

*   **🤖 Universal Chat:** Simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
*   **📜 History Management (via Adapters):** **Requires `historyAdapter` configuration.** Automatic loading and saving of dialog history for each user (`user`).
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Built-in adapters: `MemoryHistoryStorage`, `DiskHistoryStorage`.
    *   Easily plug in custom adapters or use the provided `createRedisHistoryPlugin`.
    *   Configure cache TTL (`historyTtl`) and cleanup intervals (`historyCleanupInterval`).
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for model-driven function calls.
    *   Define tools (`Tool`) with JSON Schema for argument validation.
    *   Automatic argument parsing, validation, and **security checks**.
    *   Execution of your `execute` functions with context (`ToolContext`).
    *   Automatic sending of results back to the model.
    *   **Structured tool error handling** for better model understanding.
    *   Configurable limit on recursive calls (`maxToolCalls`).
*   **🛡️ Security Module:** Comprehensive and configurable protection.
    *   **Authentication:** JWT (built-in), `api-key`, `custom`.
    *   **Access Control (ACL):** Based on roles, scopes, API keys, explicit rules.
    *   **Rate Limiting:** Configurable limits for users/roles. (Default implementation is **not** for distributed systems).
    *   **Argument Sanitization:** Protection against dangerous patterns (SQLi, XSS, etc.). Audit mode support.
    *   **Event System** for monitoring.
*   **📈 Cost Tracking:** (Optional) Automatic estimation of the cost for each `chat()` call. Background price updates. `getCreditBalance()` method.
*   **🔄 Routing (Models and Providers):**
    *   **Models:** Specify fallback models (`modelFallbacks` in config or `models` in request).
    *   **Providers:** Fine-grained control over provider selection per request (`provider` option) or globally (`defaultProviderRouting`) - sorting (price, speed), ordering, ignoring, parameter requirements, etc.
*   **🌐 Web Search:** (Optional) Integrate web search results into model responses via `plugins: [{ id: 'web', ... }]` option or `:online` model suffix. Returns annotations (`annotations`) with sources.
*   **🤔 Reasoning Tokens:** (Optional) Request and receive model reasoning steps via the `reasoning` option.
*   **📐 Structured Outputs:** Request responses in JSON format (`responseFormat: { type: 'json_object' }`) or according to a strict JSON Schema (`responseFormat: { type: 'json_schema', json_schema: {...} }`), including support for the `strict` flag.
*   **⚙️ Flexible Configuration:** Configure API key, model, endpoint, timeouts, **proxy**, headers, **history adapter**, and many other parameters via `OpenRouterConfig`.
*   **💡 Typing:** Fully written in TypeScript.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`OpenRouterError` and subclasses) with codes (`ErrorCode`) and details.
*   **📝 Logging:** Built-in logger (`Logger`) with prefixes and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API.
*   **🧹 Resource Management:** `client.destroy()` method for proper resource cleanup.
*   **🧩 Plugin System and Middleware:** Extend functionality without modifying the core.

### 🚕 Example: Taxi Bot

This example demonstrates using dialog history and tool calling. **Note the mandatory inclusion of `historyAdapter` and the corresponding `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-flash-1.5", // Use an up-to-date model
  historyAdapter: new MemoryHistoryStorage(), // Required for history
  enableCostTracking: true,
  debug: false, // Set to true for detailed logs
  // security: { /* ... add security config if needed ... */ }
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
    execute: async (args, context) => {
      console.log(`[Tool acceptOrder] Accepting order from ${args.from} to ${args.to}...`);
      console.log(`[Tool acceptOrder] Order initiated by user: ${context?.userInfo?.userId || 'anonymous'}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1; // Simulate driver assignment
      orderAccepted = true; // Set flag to end the loop
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

const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your task is to help the customer order a taxi.
1. Clarify the pickup address ('from') and destination address ('to') if the customer hasn't provided them. Be polite.
2. Once the addresses are known, YOU MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm they accept the cost and are ready to order (e.g., with words like "order", "okay", "yes", "sounds good").
4. After customer confirmation, use the 'acceptOrder' tool, passing it the 'from' and 'to' addresses.
5. After calling 'acceptOrder', inform the customer of the result returned by the tool.
6. Do not invent driver numbers or order statuses yourself; rely on the response from the 'acceptOrder' tool.
7. If the user asks something unrelated to ordering a taxi, politely steer them back to the topic.`;

async function chatWithTaxiBot() {
  const userId = `taxi-user-${Date.now()}`;
  console.log(`\nBot Kit: Hello! I'm your virtual assistant... (Session ID: ${userId})`);

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
          console.log("Bot Kit: Thank you for contacting us! Goodbye.");
          break;
      }

      console.log("Bot Kit: One moment, processing your request...");
      const result = await client.chat({
        user: userId, // Key for history
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide available tools
        temperature: 0.5,
        maxToolCalls: 5 // Limit the number of tool call cycles
      });

      // Display the assistant's final response
      console.log(`\nBot Kit: ${result.content}\n`);

      // Display debug info if enabled
      if (client.isDebugMode()) {
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
          if (result.reasoning) console.log(`[Debug] Reasoning: ${result.reasoning}`);
          if (result.annotations && result.annotations.length > 0) console.log(`[Debug] Annotations:`, result.annotations);
      }

      // Check the flag set by the acceptOrder tool
      if (orderAccepted) {
        console.log("Bot Kit: If you have any more questions, I'm here to help!");
        // Optionally add 'break;' here if the dialog should end after ordering
      }
    }
  } catch (error) {
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
    console.log("\nClient stopped. Session ended.");
  }
}

chatWithTaxiBot();
```

### ⚙️ API and Concepts

#### `OpenRouterClient`

The main class for interacting with the library.

##### Configuration (`OpenRouterConfig`)

Passed to the constructor (`new OpenRouterClient(config)`). Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `apiEndpoint?` (string): Chat completions endpoint URL (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `model?` (string): Default model ID for requests.
*   `debug?` (boolean): Enable verbose logging (default: `false`).
*   `proxy?` (string | object): HTTP/HTTPS proxy settings.
*   `referer?` (string): `HTTP-Referer` header value.
*   `title?` (string): `X-Title` header value.
*   `axiosConfig?` (object): Additional Axios configuration.
*   `historyAdapter?` (IHistoryStorage): **Required for history management.** An instance of a history storage adapter (e.g., `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Cache TTL for history entries in `UnifiedHistoryManager` (milliseconds).
*   `historyCleanupInterval?` (number): Cleanup interval for expired history cache entries in `UnifiedHistoryManager` (milliseconds).
*   `defaultProviderRouting?` (ProviderRoutingConfig): Default provider routing rules.
*   `modelFallbacks?` (string[]): Default list of fallback model IDs.
*   `responseFormat?` (ResponseFormat | null): Default response format.
*   `maxToolCalls?` (number): Default maximum tool call cycles per `chat()` call (default: 10).
*   `strictJsonParsing?` (boolean): Throw an error on invalid JSON response (if JSON format requested)? (default: `false`, returns `null`).
*   `security?` (SecurityConfig): Security module configuration (uses base `SecurityConfig` type from `./types`).
*   `enableCostTracking?` (boolean): Enable cost tracking (default: `false`).
*   `priceRefreshIntervalMs?` (number): Model price refresh interval (default: 6 hours).
*   `initialModelPrices?` (object): Initial model prices to avoid the first price fetch.
*   *Deprecated fields:* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`, `enableReasoning`, `webSearch`.

##### Core Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Main method for sending chat requests. Takes `options` object (see below).
*   `getHistoryManager(): UnifiedHistoryManager`: Returns the history manager instance.
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager instance.
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker instance.
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches OpenRouter credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cached model prices.
*   `refreshModelPrices(): Promise<void>`: Forces a refresh of model prices.
*   `createAccessToken(userInfo, expiresIn?): string`: Generates a JWT (if configured).
*   `use(plugin): Promise<void>`: Registers a plugin.
*   `useMiddleware(fn): void`: Registers middleware.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events.
*   `destroy(): Promise<void>`: Releases resources.

##### `client.chat` Request Options (`OpenRouterRequestOptions`)

These options are passed to the `client.chat()` method to configure a specific request:

*   `prompt?` (string): Simple user text prompt. **Either** `prompt` **or** `customMessages` **is required**.
*   `customMessages?` (Message[] | null): Full message array to send (overrides `prompt` and history). **Either** `prompt` **or** `customMessages` **is required**.
*   `user?` (string): User ID for automatic history management (requires `historyAdapter`).
*   `group?` (string | null): Group ID for history (used with `user`).
*   `systemPrompt?` (string | null): System prompt for the request.
*   `accessToken?` (string | null): Access token for security checks.
*   `model?` (string): Model ID for this request (overrides default). Can use `:online` suffix for web search.
*   `temperature?`, `maxTokens?`, `topP?`, `presencePenalty?`, `frequencyPenalty?`, `stop?`, `seed?`, `logitBias?`: Standard LLM generation parameters.
*   `tools?` (Tool[] | null): Array of available tools for this request.
*   `toolChoice?`: Control model's tool selection (`'auto'`, `'none'`, `{ type: "function", function: { name: "..." } }`).
*   `parallelToolCalls?` (boolean): Allow the model to request multiple tools concurrently.
*   `maxToolCalls?` (number): Override the recursive tool call limit for this request.
*   `responseFormat?` (ResponseFormat | null): Request a specific response format (JSON Object or JSON Schema).
*   `strictJsonParsing?` (boolean): Override the strict JSON parsing setting for this request.
*   `provider?` (ProviderRoutingConfig): Provider routing rules for this request.
*   `models?` (string[]): List of models (primary + fallbacks) for this request.
*   `plugins?` (PluginConfig[]): List of plugins to activate (e.g., `[{ id: 'web', max_results: 3 }]`).
*   `reasoning?` (ReasoningConfig): Settings for requesting reasoning tokens (`effort`, `max_tokens`, `exclude`).
*   `transforms?` (string[]): OpenRouter transforms (e.g., `["middle-out"]`).
*   `route?`: Deprecated OpenRouter routing parameter.

##### `client.chat` Result (`ChatCompletionResult`)

The `client.chat()` method returns a `Promise` that resolves to a `ChatCompletionResult` object with the following fields:

*   `content` (any): The final response content from the model (string, JSON object, etc., depending on the request and response).
*   `usage` (UsageInfo | null): Total token usage (prompt + completion, including tool calls).
*   `model` (string): ID of the model that generated the final response.
*   `toolCallsCount` (number): Total number of successful tool calls made during this request.
*   `finishReason` (string | null): The reason the final generation step finished (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
*   `durationMs` (number): Total execution time of the `chat()` request in milliseconds.
*   `id?` (string): ID of the last generation step from the OpenRouter API.
*   `cost?` (number | null): Estimated cost of the request (if `enableCostTracking: true`).
*   `reasoning?` (string | null): Model's reasoning steps (if requested and returned).
*   `annotations?` (UrlCitationAnnotation[]): Array of annotations (e.g., web search citations) related to the final response.

#### 🧩 Plugins and Middleware

*   **Plugins:** Modules extending client functionality. Registered via `client.use(plugin)`. Can initialize services, replace standard managers (`setSecurityManager`, `setCostTracker`), add middleware.
*   **Middleware:** Functions executed sequentially for each `client.chat()` call. Allow modification of request (`ctx.request`), response (`ctx.response`), or performing side effects (logging, auditing). Registered via `client.useMiddleware(fn)`.

#### 📜 History Management (Adapters)

Automatic history management requires configuring `historyAdapter` in `OpenRouterConfig`.

*   **Adapter (`IHistoryStorage`):** Defines the storage interface (`load`, `save`, `delete`, `listKeys`, `destroy?`).
*   **`UnifiedHistoryManager`:** Internal component using the adapter and managing in-memory caching.
*   **Built-in Adapters:** `MemoryHistoryStorage`, `DiskHistoryStorage`.
*   **Usage:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';
    const client = new OpenRouterClient({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
    ```
*   **Redis Plugin:** Use `createRedisHistoryPlugin`.
*   **Cache Settings:** `historyTtl`, `historyCleanupInterval`.

#### 🛠️ Tool Handling (Function Calling)

Allows LLMs to call your custom functions.

1.  **Define Tool (`Tool`):** Create an object with `type: 'function'`, `function: { name, description?, parameters? }` (JSON Schema for args), and your `execute: (args, context?) => Promise<any> | any` function. Optionally add `security` rules.
2.  **Use in `client.chat()`:** Pass the tool array in `options.tools`. The library handles:
    *   Sending definitions to the model.
    *   Intercepting tool call requests.
    *   Parsing and validating arguments.
    *   **Performing security checks** (`SecurityManager`).
    *   Calling your `execute` function.
    *   **Sending the result (or structured error) back to the model.**
    *   Returning the final user-facing response.
3.  **Result:** Final response in `ChatCompletionResult.content`, call count in `ChatCompletionResult.toolCallsCount`.

#### 🔒 Security Module (`SecurityManager`)

Activated by passing `security: SecurityConfig` to the `OpenRouterClient` constructor. Provides authentication, access control, rate limiting, and argument sanitization for tool calls. Requires careful configuration, especially `userAuthentication.jwtSecret`. **Default Rate Limiter is not suitable for distributed systems.**

#### 📈 Cost Tracking

Enabled via `enableCostTracking: true`. Calculates **approximate** cost of `chat()` calls based on `usage` data and cached model prices. Provides `getCreditBalance()`, `getModelPrices()`, `refreshModelPrices()` methods.

#### 🔄 Routing (Models and Providers)

*   **Models:** Define fallback model lists in `OpenRouterConfig` (`modelFallbacks`) or per request in `OpenRouterRequestOptions` (`models`). The request-level `models` list takes precedence.
*   **Providers:** Control provider selection via `defaultProviderRouting` in `OpenRouterConfig` or `provider` in `OpenRouterRequestOptions`. The request-level `provider` option overrides the default. Allows setting order (`order`), enabling/disabling fallbacks (`allow_fallbacks`), ignoring providers (`ignore`), requiring parameter support (`require_parameters`), filtering by data policy (`data_collection`) or quantization (`quantizations`), and sorting (`sort`).

#### 🌐 Web Search

*   **Activation:**
    *   Append `:online` suffix to the model name in `options.model` (e.g., `'openai/gpt-4o-mini:online'`).
    *   Or pass the plugin in `options.plugins`: `plugins: [{ id: 'web' }]`. You can also configure `max_results` and `search_prompt`: `plugins: [{ id: 'web', max_results: 3 }]`.
*   **Result:** The final model response may incorporate web search results. Source links will be available in the `ChatCompletionResult.annotations` field.

#### 🤔 Reasoning Tokens

*   **Request:** Pass a `reasoning` object in the `options` of `client.chat()`.
    *   `effort`: `'low'`, `'medium'`, or `'high'`.
    *   `max_tokens`: Number of tokens for reasoning.
    *   `exclude`: `true` to have the model reason internally but not include it in the response.
*   **Result:** Reasoning steps will be available in the `ChatCompletionResult.reasoning` field (if `exclude: false`).

#### ⚙️ Response Format (`responseFormat` and Structured Outputs)

Request a JSON response.

*   **Configuration:** `responseFormat` option in `OpenRouterConfig` or `OpenRouterRequestOptions`.
*   **Types:**
    *   `{ type: 'json_object' }`: Any valid JSON.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: JSON matching your schema. The `strict` flag is passed to the API if provided.
*   **Parsing Error Handling:** Depends on `strictJsonParsing` (default `false` returns `null`, `true` throws `ValidationError`).

#### ⚠️ Error Handling

Use `try...catch` and check errors via `instanceof` or `error.code` (`ErrorCode`). Subscribe to the client's `'error'` event for global logging.

#### 📝 Logging

Enabled via `debug: true`. Uses `console` with component prefixes.

#### 🌐 Proxy

Configured via the `proxy` option (URL string or object `{ host, port, user?, pass? }`) in `OpenRouterConfig`.

### 📄 License

[MIT](./LICENSE)