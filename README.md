# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies working with LLMs by providing a unified API for chats, history management, tool handling (function calling), request routing, web search, reasoning tokens, and much more.

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

The most basic example for sending a request and getting a response from a model.

```typescript
// simple-chat.ts
import { OpenRouterClient } from 'openrouter-kit';

// Initialize the client with your API key
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: "google/gemini-2.0-flash-001" // Default model for all calls
});

async function main() {
  console.log('Sending a simple request...');
  const result = await client.chat({
    prompt: 'Write a short greeting for a README.',
    model: 'openai/gpt-4o-mini', // Override the model for this call
    temperature: 0.7,
  });

  console.log('--- Result ---');
  console.log('Model response:', result.content);
  console.log('Model used:', result.model);
  console.log('Tokens used:', result.usage);
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
  enableCostTracking: true, // Enable cost calculation
  model: "google/gemini-2.0-flash-001"
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

This example shows how the model can use functions (tools) you provide to get external information.

```javascript
// tools-example.js (CommonJS)
const { OpenRouterClient } = require("openrouter-kit");

// --- Sample data (replace with your actual data sources) ---
const users = [ { id: "user_1001", nick: "alice" }, /* ... */ ];
const messages = [ { id: "msg_101", userId: "user_1001", content: "Hi!" }, /* ... */ ];
// ---

// --- Tool Definitions ---
const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Gets the user ID by their nickname",
      parameters: { type: "object", properties: { nick: { type: "string" } }, required: ["nick"] },
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
      parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
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
  model: "google/gemini-2.0-flash-001", // A model that supports tools
});

async function main() {
  try {
    const promptAlice = "Find all messages from user alice.";
    console.log(`\nRequest: "${promptAlice}"`);
    const resultAlice = await client.chat({
      prompt: promptAlice,
      tools: userTools,
      temperature: 0.5,
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

### 4. Requesting Response in JSON Format (`json_object`)

This example shows how to request the model's response as any valid JSON object.

```typescript
// json-object-example.ts
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: 'openai/gpt-4o-mini', // A model that works well with JSON
});

async function main() {
  try {
    const prompt = "Provide information about user John Doe: age 30, city New York, in JSON format.";
    console.log(`Request: "${prompt}" (expecting JSON object)`);

    const result = await client.chat({
      prompt: prompt,
      temperature: 0.2,
      responseFormat: {
        type: 'json_object', // <-- Request JSON object
      },
      // tools: [] // Ensure tools are not passed if the model doesn't support them with responseFormat
    });

    console.log('--- Result ---');
    // result.content should be a JavaScript object
    console.log('Model response (type):', typeof result.content);
    console.log('Model response (content):', result.content);
    console.log('Model used:', result.model);

    // Example of accessing fields
    if (result.content && typeof result.content === 'object') {
      console.log('Username from response:', result.content.name || result.content.userName);
    }

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    if (error.details) console.error(`Details:`, error.details);
  } finally {
    console.log('\nShutting down...');
    await client.destroy();
  }
}

main();
```

### 5. Requesting Response via JSON Schema (`json_schema`)

This example shows how to request a response that strictly adheres to a provided JSON Schema.

```typescript
// json-schema-example.ts
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: 'openai/gpt-4o-mini', // A model that works well with schemas
  // strictJsonParsing: true, // Uncomment to get an error if the model returns invalid JSON
});

// Define our JSON Schema
const answerSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A brief summary of the answer to the question"
    },
    confidence: {
      type: "number",
      description: "Confidence in the answer from 0.0 to 1.0",
      minimum: 0,
      maximum: 1
    },
    tags: {
        type: "array",
        description: "A list of relevant keywords (tags)",
        items: {
            type: "string"
        }
    }
  },
  required: ["summary", "confidence", "tags"] // Required fields
};

async function main() {
  try {
    const prompt = "Briefly explain quantum entanglement, estimate your confidence, and add tags.";
    console.log(`Request: "${prompt}" (expecting JSON according to 'answer' schema)`);

    const result = await client.chat({
      prompt: prompt,
      temperature: 0.3,
      responseFormat: {
        type: 'json_schema', // <-- Request JSON according to schema
        json_schema: {
          name: 'answer', // Name to identify the schema (may be used by the model)
          schema: answerSchema, // Pass the schema itself
          strict: true // <-- Ask the model to strictly follow the schema (if supported)
        }
      },
      // tools: [] // Ensure tools are not passed if the model doesn't support them with responseFormat
    });

    console.log('--- Result ---');
    // result.content should be a JavaScript object matching the schema
    console.log('Model response (type):', typeof result.content);
    console.log('Model response (content):', result.content);
    console.log('Model used:', result.model);

    // Example of accessing fields
    if (result.content && typeof result.content === 'object') {
      console.log('Summary:', result.content.summary);
      console.log('Tags:', result.content.tags?.join(', '));
    }

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    if (error.details) console.error(`Details:`, error.details);
  } finally {
    console.log('\nShutting down...');
    await client.destroy();
  }
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
*   [⚙️ API and Concepts](#️-api-and-concepts)
    *   [OpenRouterClient](#openrouterclient)
        *   [Configuration (OpenRouterConfig)](#configuration-openrouterconfig)
        *   [Core Methods](#core-methods)
        *   [`client.chat` Request Options (OpenRouterRequestOptions)](#-clientchat-request-options-openrouterrequestoptions)
        *   [`client.chat` Result (ChatCompletionResult)](#-clientchat-result-chatcompletionresult)
    *   [Plugins and Middleware](#-plugins-and-middleware)
    *   [History Management (Adapters)](#-history-management-adapters)
    *   [Tool Handling (Function Calling)](#-tool-handling-function-calling)
    *   [Security Module (SecurityManager)](#-security-module-securitymanager)
    *   [Cost Tracking](#-cost-tracking)
    *   [Routing (Models and Providers)](#-routing-models-and-providers)
    *   [Web Search](#-web-search)
    *   [Reasoning Tokens](#-reasoning-tokens)
    *   [Response Format (`responseFormat` and Structured Outputs)](#️-response-format-responseformat-and-structured-outputs)
    *   [Error Handling](#️-error-handling)
    *   [Logging](#-logging)
    *   [Proxy](#-proxy)
*   [📄 License](#-license)

### 🌟 Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, tool handling, and routing are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, **history storage (requires adapter)**, security, provider/model routing, and more, both globally and per request.
*   **Security:** The built-in security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the library core.
*   **Reliability:** Fully typed with TypeScript, predictable error handling (including structured tool errors), and resource management.
*   **Modern Features:** Support for web search, reasoning tokens, structured outputs, and other OpenRouter API capabilities.

### 🚀 Key Features

*   **🤖 Universal Chat:** Simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
*   **📜 History Management (via Adapters):** **Requires `historyAdapter` configuration**. Automatic loading and saving of dialog history for each user (`user`).
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Included: `MemoryHistoryStorage`, `DiskHistoryStorage`.
    *   Easily plug in your own adapters or use the provided plugin (`createRedisHistoryPlugin`).
    *   Configure cache TTL (`historyTtl`) and cleanup intervals (`historyCleanupInterval`).
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for model-driven function calls.
    *   Define tools (`Tool`) with JSON Schema for argument validation.
    *   Automatic parsing, validation, and **security checks** of arguments.
    *   Execution of your `execute` functions with context (`ToolContext`).
    *   Automatic sending of results back to the model.
    *   **Structured tool error handling** for better model understanding.
    *   Configurable limit on recursive calls (`maxToolCalls`).
*   **🛡️ Security Module:** Comprehensive and configurable protection.
    *   **Authentication:** JWT (built-in), `api-key`, `custom`.
    *   **Access Control (ACL):** By roles, scopes, API keys, explicit rules.
    *   **Rate Limiting:** Configurable limits for users/roles. (Default implementation is **not** for distributed systems).
    *   **Argument Sanitization:** Protection against dangerous patterns (SQLi, XSS, etc.). Audit mode available.
    *   **Event System** for monitoring.
*   **📈 Cost Tracking:** (Optional) Automatic calculation of the approximate cost for each `chat()` call. Background price updates. `getCreditBalance()` method.
*   **🔄 Routing (Models and Providers):**
    *   **Models:** Specify fallback models (`modelFallbacks` in config or `models` in request).
    *   **Providers:** Fine-tune provider selection per request (`provider` in request) or globally (`defaultProviderRouting` in config) - sorting (price, speed), order, ignore, parameter requirements, etc.
*   **🌐 Web Search:** (Optional) Integrate web search results into the model's response via the `plugins: [{ id: 'web', ... }]` option or the `:online` suffix on the model name. Returns annotations (`annotations`) with sources.
*   **🤔 Reasoning Tokens:** (Optional) Request and receive the model's reasoning steps via the `reasoning` option.
*   **📐 Structured Outputs:** Request responses in JSON format (`responseFormat: { type: 'json_object' }`) or according to a strict JSON Schema (`responseFormat: { type: 'json_schema', json_schema: {...} }`), including support for the `strict` flag.
*   **⚙️ Flexible Configuration:** Set API key, model, endpoint, timeouts, **proxy**, headers, **history adapter**, and much more via `OpenRouterConfig`.
*   **💡 Typing:** Fully written in TypeScript.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`OpenRouterError` and subclasses) with codes (`ErrorCode`) and details.
*   **📝 Logging:** Built-in logger (`Logger`) with prefixes and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API.
*   **🧹 Resource Management:** `client.destroy()` method for proper resource cleanup.
*   **🧩 Plugin System and Middleware:** Extend functionality without modifying the core.

### 🚕 Example: Taxi Bot

This example demonstrates the use of dialog history and tool calling. **Note the mandatory inclusion of `historyAdapter` and the corresponding `require`.**

```javascript
// taxi-bot.js (CommonJS)
const { OpenRouterClient, MemoryHistoryStorage } = require("openrouter-kit");
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001",
  historyAdapter: new MemoryHistoryStorage(), // Required for history
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
          from: { type: "string", description: "Pickup address (e.g., '1 Lenin St, Moscow')" },
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
      description: "Accepts and confirms the taxi order, assigns a driver.",
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
      const driverNumber = Math.floor(Math.random() * 100) + 1;
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
2. Once the addresses are known, MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
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
        console.log("Bot Kit: If you have any more questions, feel free to ask!");
        // Could add a break here if the dialog should end after the order
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

When creating the client (`new OpenRouterClient(config)`), a configuration object is passed. Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `apiEndpoint?` (string): Chat completions endpoint URL (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `model?` (string): Default model for requests.
*   `debug?` (boolean): Enable detailed logging (default: `false`).
*   `proxy?` (string | object): HTTP/HTTPS proxy settings.
*   `referer?` (string): Value for the `HTTP-Referer` header.
*   `title?` (string): Value for the `X-Title` header.
*   `axiosConfig?` (object): Additional configuration for Axios.
*   `historyAdapter?` (IHistoryStorage): **Required for using history.** An instance of a history storage adapter (e.g., `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Time-to-live (TTL) for history entries in the `UnifiedHistoryManager` cache (in milliseconds).
*   `historyCleanupInterval?` (number): Interval for cleaning expired entries from the `UnifiedHistoryManager` history cache (in milliseconds).
*   `defaultProviderRouting?` (ProviderRoutingConfig): Default provider routing rules.
*   `modelFallbacks?` (string[]): Default list of fallback models.
*   `responseFormat?` (ResponseFormat | null): Default response format.
*   `maxToolCalls?` (number): Maximum number of tool call cycles per `chat()` call (default: 10).
*   `strictJsonParsing?` (boolean): Throw an error on invalid JSON response (if JSON format requested)? (default: `false`, returns `null`).
*   `security?` (SecurityConfig): Security module configuration (uses the base `SecurityConfig` type from `./types`).
*   `enableCostTracking?` (boolean): Enable cost tracking (default: `false`).
*   `priceRefreshIntervalMs?` (number): Interval for refreshing model prices (default: 6 hours).
*   `initialModelPrices?` (object): Initial model prices to avoid the first price request.
*   *Deprecated fields:* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`, `enableReasoning`, `webSearch`.

##### Core Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: The main method for sending chat requests. Accepts an `options` object with request parameters (see below).
*   `getHistoryManager(): UnifiedHistoryManager`: Returns the history manager.
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager.
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker.
*   `getCreditBalance(): Promise<CreditBalance>`: Requests the credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cached model prices.
*   `refreshModelPrices(): Promise<void>`: Force-refreshes the price cache.
*   `createAccessToken(userInfo, expiresIn?): string`: Generates a JWT (if configured).
*   `use(plugin): Promise<void>`: Registers a plugin.
*   `useMiddleware(fn): void`: Registers middleware.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events.
*   `destroy(): Promise<void>`: Releases resources.

##### `client.chat` Request Options (`OpenRouterRequestOptions`)

These options are passed to the `client.chat()` method to configure a specific request:

*   `prompt?` (string): Simple text user prompt. **Either** `prompt` **or** `customMessages` **is required**.
*   `customMessages?` (Message[] | null): Full array of messages to send (overrides `prompt` and history). **Either** `prompt` **or** `customMessages` **is required**.
*   `user?` (string): User ID for automatic history management (requires `historyAdapter`).
*   `group?` (string | null): Group ID for history (used with `user`).
*   `systemPrompt?` (string | null): System prompt for the request.
*   `accessToken?` (string | null): Access token for security checks.
*   `model?` (string): Model ID for this request (overrides default). Can use the `:online` suffix to activate web search.
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
*   `usage` (UsageInfo | null): Total tokens used (prompt + completion, including tool calls).
*   `model` (string): ID of the model that generated the final response.
*   `toolCallsCount` (number): Total number of successful tool calls made during this request.
*   `finishReason` (string | null): Reason the final response generation stopped (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
*   `durationMs` (number): Total execution time of the `chat()` request in milliseconds.
*   `id?` (string): ID of the last generation step from the OpenRouter API.
*   `cost?` (number | null): Calculated approximate cost of the request (if `enableCostTracking: true`).
*   `reasoning?` (string | null): String containing the model's reasoning steps (if requested and returned).
*   `annotations?` (UrlCitationAnnotation[]): Array of annotations (e.g., web search citations) related to the final response.

#### 🧩 Plugins and Middleware

*   **Plugins:** Modules that extend client functionality. Registered via `client.use(plugin)`. Can initialize services, replace standard managers (`setSecurityManager`, `setCostTracker`), add middleware.
*   **Middleware:** Functions executed sequentially for each `client.chat()` call. Allow modification of the request (`ctx.request`), response (`ctx.response`), or performing side effects (logging, auditing). Registered via `client.useMiddleware(fn)`.

#### 📜 History Management (Adapters)

To enable automatic dialog history management, **`historyAdapter` must be configured** in `OpenRouterConfig`.

*   **Adapter (`IHistoryStorage`):** Defines the interface for storage (`load`, `save`, `delete`, `listKeys`, `destroy?`).
*   **`UnifiedHistoryManager`:** Internal component using the adapter and managing in-memory caching.
*   **Built-in Adapters:** `MemoryHistoryStorage`, `DiskHistoryStorage`.
*   **Setup:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';
    const client = new OpenRouterClient({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
    ```
*   **Redis Plugin:** Use `createRedisHistoryPlugin`.
*   **Cache Settings:** `historyTtl`, `historyCleanupInterval`.

#### 🛠️ Tool Handling (Function Calling)

Allows LLM models to call your custom functions.

1.  **Define a Tool (`Tool`):** Define an object with `type: 'function'`, `function: { name, description?, parameters? }` (JSON Schema for arguments), and your function `execute: (args, context?) => Promise<any> | any`. Optionally add `security` rules.
2.  **Use in `client.chat()`:** Pass an array of tools in `options.tools`. The library automatically:
    *   Sends definitions to the model.
    *   Intercepts the call request (`finish_reason: 'tool_calls'`).
    *   Parses and validates arguments.
    *   **Performs security checks** (`SecurityManager`).
    *   Calls your `execute` function.
    *   **Sends the result (or a structured error) back to the model.**
    *   Returns the final model response to the user.
3.  **Result:** Final response in `ChatCompletionResult.content`, number of calls in `ChatCompletionResult.toolCallsCount`.

#### 🔒 Security Module (`SecurityManager`)

Activated by passing a `security: SecurityConfig` object to the `OpenRouterClient` constructor. Provides authentication, access control, rate limiting, and argument sanitization for tool calls. Requires careful configuration, especially `userAuthentication.jwtSecret`. **The default Rate Limiter is not suitable for distributed systems.**

#### 📈 Cost Tracking

Enabled via `enableCostTracking: true`. Calculates the **approximate** cost of `chat()` calls based on `usage` data and cached model prices. Provides `getCreditBalance()`, `getModelPrices()`, `refreshModelPrices()` methods.

#### 🔄 Routing (Models and Providers)

*   **Models:** Define fallback models in `OpenRouterConfig` (`modelFallbacks`) or per request in `OpenRouterRequestOptions` (`models`). The `models` list in the request takes precedence.
*   **Providers:** Control provider selection via `defaultProviderRouting` in `OpenRouterConfig` or `provider` in `OpenRouterRequestOptions`. The `provider` option in the request overrides the default. Allows setting order (`order`), enabling/disabling fallbacks (`allow_fallbacks`), ignoring providers (`ignore`), requiring parameter support (`require_parameters`), filtering by data policy (`data_collection`) or quantization (`quantizations`), and sorting (`sort`).

#### 🌐 Web Search

*   **Activation:**
    *   Add the `:online` suffix to the model name in `options.model` (e.g., `'openai/gpt-4o-mini:online'`).
    *   Or pass the plugin in `options.plugins`: `plugins: [{ id: 'web' }]`. You can also configure `max_results` and `search_prompt`: `plugins: [{ id: 'web', max_results: 3 }]`.
*   **Result:** The final model response may contain web search results. Source links will be available in the `ChatCompletionResult.annotations` field.

#### 🤔 Reasoning Tokens

*   **Request:** Pass a `reasoning` object in the `options` of the `client.chat()` method.
    *   `effort`: `'low'`, `'medium'`, or `'high'`.
    *   `max_tokens`: Number of tokens for reasoning.
    *   `exclude`: `true` for the model to reason but not include it in the response.
*   **Result:** Reasoning steps will be available in the `ChatCompletionResult.reasoning` field (if `exclude: false`).

#### ⚙️ Response Format (`responseFormat` and Structured Outputs)

Request the response in JSON format to simplify parsing and data handling.

*   **Configuration:** The `responseFormat` option in `OpenRouterConfig` (to set a default) or `OpenRouterRequestOptions` (for a specific request).
*   **Types:**
    *   `{ type: 'json_object' }`: The model should return any valid JSON object.
        ```typescript
        // Example usage in client.chat()
        await client.chat({
          prompt: "...",
          responseFormat: { type: 'json_object' }
        });
        ```
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: The model should return JSON matching your JSON Schema.
        *   `name`: A name for your schema (required).
        *   `schema`: The JSON Schema object itself (required).
        *   `strict?`: (boolean) Require the model to strictly adhere to the schema (if the model supports it).
        *   `description?`: (string) A description of the schema for the model.
        ```typescript
        // Example schema definition
        const userProfileSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer', minimum: 0 },
            isStudent: { type: 'boolean' },
            courses: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['name', 'age', 'courses']
        };

        // Example usage in client.chat()
        await client.chat({
          prompt: "...",
          responseFormat: {
            type: 'json_schema',
            json_schema: {
              name: 'user_profile',
              schema: userProfileSchema,
              strict: true
            }
          }
        });
        ```

*   **Parsing Error Handling:** If the model returns invalid JSON (despite the format request), the behavior depends on the `strictJsonParsing` setting (in `OpenRouterConfig` or `OpenRouterRequestOptions`):
    *   `false` (default): `result.content` will be `null`.
    *   `true`: A `ValidationError` with code `ErrorCode.JSON_PARSE_ERROR` or `ErrorCode.JSON_SCHEMA_ERROR` will be thrown.

*   **⚠️ Warning about `tools` Compatibility:** Not all models support using the `responseFormat` option (to force JSON output) and the `tools` option (for function calling) simultaneously. For example, some Google Gemini versions might return an error with this combination.
    *   **Solution:**
        1.  Use **either** `responseFormat` **or** `tools` for such models.
        2.  If you need both function calling and a JSON result, create a tool that returns the desired JSON itself, and ask the model to call that tool.
        3.  Use a different model known to support both features concurrently (e.g., OpenAI GPT-4/GPT-4o models).

#### ⚠️ Error Handling

Use `try...catch` and check errors via `instanceof` or `error.code` (`ErrorCode`). Subscribe to the client's `'error'` event for global logging.

#### 📝 Logging

Enabled via `debug: true`. Uses `console` with component prefixes.

#### 🌐 Proxy

Configured via the `proxy` option (URL string or object `{ host, port, user?, pass? }`) in `OpenRouterConfig`.

### 📄 License

[MIT](./LICENSE)