# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful, flexible, and user-friendly TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies working with LLMs by providing a unified API for chats, **history management with metadata**, **history analysis**, tool handling (function calling), request routing, web search, reasoning tokens, and more.

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
  model: "google/gemini-2.5-flash-preview" // Default model for all calls
});

async function main() {
  console.log('Sending a simple request...');
  try {
    const result = await client.chat({
      prompt: 'Write a short greeting for a README.',
      model: 'openai/gpt-4o-mini', // Override model for this call
      temperature: 0.7,
    });

    console.log('--- Result ---');
    console.log('Model response:', result.content);
    console.log('Model used:', result.model);
    console.log('Tokens used:', result.usage);
  } catch (error: any) {
    console.error("Error:", error.message);
  } finally {
    await client.destroy();
  }
}

main();
```

### 2. Dialog Example (with History Management)

To maintain dialog context, use `historyAdapter` and pass a `user` ID. The library will automatically load and save the history **along with API call metadata**.

```typescript
// dialog-chat.ts
import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  // Use MemoryHistoryStorage to store history in memory
  historyAdapter: new MemoryHistoryStorage(),
  enableCostTracking: true, // Enable cost calculation (saved in metadata)
  model: "google/gemini-2.5-flash-preview",
  debug: false, // Set true for detailed logs
});

const userId = 'dialog-user-123'; // Unique ID for the user

async function runDialog() {
  try {
    // First message
    console.log(`[${userId}] You: Hi! Remember my favorite color is blue.`);
    const result1 = await client.chat({
      user: userId, // <-- Pass the user ID for automatic history management
      prompt: 'Hi! Remember my favorite color is blue.',
    });
    console.log(`[${userId}] Bot: ${result1.content}`);
    console.log(`(Cost: $${result1.cost?.toFixed(8) || 'N/A'})`);

    // Second message (model should remember the context)
    console.log(`\n[${userId}] You: What is my favorite color?`);
    const result2 = await client.chat({
      user: userId, // <-- Same user ID
      prompt: 'What is my favorite color?',
    });
    console.log(`[${userId}] Bot: ${result2.content}`);
    console.log(`(Cost: $${result2.cost?.toFixed(8) || 'N/A'})`);

    // Check the saved history (now includes metadata)
    const historyManager = client.getHistoryManager();
    // Internal key format depends on _getHistoryKey implementation
    const historyKey = `user:${userId.replace(/[:/\\?#%]/g, '_')}`;
    const historyEntries = await historyManager.getHistoryEntries(historyKey); // Get HistoryEntry[]
    console.log(`\nSaved history entries for ${historyKey}: ${historyEntries.length}`);
    // console.log('Last entry:', JSON.stringify(historyEntries[historyEntries.length - 1], null, 2)); // Optionally inspect the last entry

  } catch (error: any) {
    console.error(`\n--- Error ---`);
    console.error(`Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
  } finally {
    console.log('\nFinishing dialog...');
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

// --- Example data (replace with your actual data sources) ---
const users = [ { id: "user_1001", nick: "alice" }, /* ... */ ];
const messages = [ { id: "msg_101", userId: "user_1001", content: "Hello!" }, /* ... */ ];
// ---

// --- Tool Definitions ---
const userTools = [
  {
    type: "function",
    function: {
      name: "getUserIdByNick",
      description: "Gets the user ID based on their nickname",
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
  model: "google/gemini-2.5-flash-preview", // Model that supports tools
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
    console.log(`(Tool calls: ${resultAlice.toolCallsCount})`);

    const promptNonExistent = "What did user nonexistent_user write?";
    console.log(`\nRequest: "${promptNonExistent}"`);
    const resultNonExistent = await client.chat({
      prompt: promptNonExistent,
      tools: userTools,
      temperature: 0.1,
    });
    console.log(`Response:\n${resultNonExistent.content}`);
    console.log(`(Tool calls: ${resultNonExistent.toolCallsCount})`);

  } catch (error) {
    console.error("\n--- Error ---");
    console.error(error);
  } finally {
    await client.destroy();
  }
}

main();
```

### 4. Requesting JSON Object Response (`json_object`)

This example shows how to request a response from the model as any valid JSON object.

```typescript
// json-object-example.ts
import { OpenRouterClient } from 'openrouter-kit';

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  model: 'openai/gpt-4o-mini', // Model that works well with JSON
});

async function main() {
  try {
    const prompt = "Provide user information for John Doe: age 30, city New York, in JSON format.";
    console.log(`Request: "${prompt}" (expecting JSON object)`);

    const result = await client.chat({
      prompt: prompt,
      temperature: 0.2,
      responseFormat: {
        type: 'json_object', // <-- Request JSON object
      },
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
    console.log('\nFinishing...');
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
  model: 'openai/gpt-4o-mini', // Model that works well with schemas
  // strictJsonParsing: true, // Uncomment to throw an error if the model returns invalid JSON
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
          name: 'answer', // Name to identify the schema (can be used by the model)
          schema: answerSchema, // Pass the schema object itself
          strict: true // <-- Ask the model to strictly follow the schema (if supported)
        }
      },
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
    console.log('\nFinishing...');
    await client.destroy();
  }
}

main();
```

---

## 📚 Detailed Guide

Now that you've seen the basic examples, you can delve deeper into the library's capabilities.

### Contents

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
    *   [History Management (Adapters & Analysis)](#-history-management-adapters--analysis)
    *   [Tool Handling (Function Calling)](#-tool-handling-function-calling)
    *   [Security Module (SecurityManager)](#-security-module-securitymanager)
    *   [Cost Tracking](#-cost-tracking)
    *   [Routing (Models & Providers)](#-routing-models--providers)
    *   [Web Search](#-web-search)
    *   [Reasoning Tokens](#-reasoning-tokens)
    *   [Response Format (responseFormat & Structured Outputs)](#️-response-format-responseformat--structured-outputs)
    *   [Error Handling](#️-error-handling)
    *   [Logging](#-logging)
    *   [Proxy](#-proxy)
*   [📄 License](#-license)

### 🌟 Why Use OpenRouter Kit?

*   **Simplicity:** Complex API interactions, history management, tool handling, and routing are hidden behind the simple `client.chat()` method.
*   **Flexibility:** Configure models, generation parameters, **history storage (requires adapter)**, security, provider/model routing, and more, both globally and per request.
*   **Analytics:** Built-in tools for analyzing saved chat history (cost, tokens, model usage).
*   **Security:** Integrated security module helps protect your applications and users when using tools.
*   **Extensibility:** Use plugins and middleware to add custom logic without modifying the library core.
*   **Reliability:** Fully typed with TypeScript, predictable error handling (including structured tool errors), and resource management.
*   **Modern Features:** Support for web search, reasoning tokens, structured outputs, and other OpenRouter API capabilities.

### 🚀 Key Features

*   **🤖 Universal Chat:** Simple and powerful API (`client.chat`) for interacting with any model available via OpenRouter.
*   **📜 History Management with Metadata:** **Requires `historyAdapter` configuration.** Automatic loading and saving of dialog history for each user (`user`), including **API call metadata** (model, tokens, cost, etc.).
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Bundled adapters: `MemoryHistoryStorage`, `DiskHistoryStorage`.
    *   Easily connect custom adapters or use the provided plugin (`createRedisHistoryPlugin`).
    *   Configurable cache TTL (`historyTtl`) and cleanup intervals (`historyCleanupInterval`).
*   **📊 History Analysis:** Retrieve aggregated statistics from saved history via `client.getHistoryAnalyzer()`:
    *   `getStats()`: Overall cost, tokens, call counts, stats by model and finish reasons.
    *   `getCostOverTime()`: Cost trends over days/hours/minutes.
    *   `getTokenUsageByModel()`: Token usage distribution across models.
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for model-driven function calls.
    *   Define tools (`Tool`) with JSON Schema for argument validation.
    *   Automatic argument parsing, validation, and **security checks**.
    *   Execution of your `execute` functions with context (`ToolContext`).
    *   Automatic sending of results (or structured errors) back to the model.
    *   **Structured tool error handling** for better model comprehension.
    *   Configurable limit on recursive calls (`maxToolCalls`).
*   **🛡️ Security Module:** Comprehensive and configurable protection.
    *   **Authentication:** JWT (built-in), `api-key`, `custom`.
    *   **Access Control (ACL):** By roles, scopes, API keys, explicit rules.
    *   **Rate Limiting:** Configurable limits for users/roles. (Default implementation is **not** for distributed systems).
    *   **Argument Sanitization:** Protection against dangerous patterns (SQLi, XSS, etc.). Audit mode available.
    *   **Event System** for monitoring.
*   **📈 Cost Tracking:** (Optional) Automatic calculation of approximate cost for each `chat()` call. Background price updates. `getCreditBalance()` method. Cost is also saved in history metadata.
*   **🔄 Routing (Models & Providers):**
    *   **Models:** Specify fallback models (`modelFallbacks` in config or `models` in request). Request `models` list takes precedence.
    *   **Providers:** Fine-tune provider selection per request (`provider` option) or globally (`defaultProviderRouting` config) - sorting (price, speed), order, ignore, parameter requirements, data policy, quantization filtering, etc.
*   **🌐 Web Search:** (Optional) Integrate web search results into model responses via the `plugins: [{ id: 'web', ... }]` option or the `:online` suffix on the model name. Returns annotations (`annotations`) with sources.
*   **🤔 Reasoning Tokens:** (Optional) Request and receive model reasoning steps via the `reasoning` option.
*   **📐 Structured Outputs:** Request responses in JSON format (`responseFormat: { type: 'json_object' }`) or according to a strict JSON Schema (`responseFormat: { type: 'json_schema', json_schema: {...} }`), including `strict` mode support.
*   **⚙️ Flexible Configuration:** Configure API key, model, endpoint, timeouts, **proxy**, headers, **history adapter**, and much more via `OpenRouterConfig`.
*   **💡 Typing:** Fully typed with TypeScript.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`OpenRouterError` and subclasses) with codes (`ErrorCode`) and details.
*   **📝 Logging:** Built-in logger (`Logger`) with prefixes and debug mode (`debug`).
*   **✨ Ease of Use:** High-level API.
*   **🧹 Resource Management:** `client.destroy()` method for proper resource cleanup.
*   **🧩 Plugin System & Middleware:** Extend functionality without modifying the core.

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
  model: "google/gemini-2.5-flash-preview",
  historyAdapter: new MemoryHistoryStorage(), // Required for history
  enableCostTracking: true,
  debug: false,
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
      description: "Accepts and confirms the taxi order, assigns a driver.",
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

const systemPrompt = `You are a friendly and efficient taxi service operator named "Kit". Your task is to help the customer book a taxi.
1. Clarify the origin address ('from') and destination address ('to') if the customer hasn't provided them. Be polite.
2. Once the addresses are known, MUST use the 'estimateRideCost' tool to inform the customer of the approximate cost.
3. Wait for the customer to confirm they are satisfied with the cost and ready to order (e.g., with words like "book it", "okay", "yes", "sounds good").
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
      const result = await client.chat({
        user: userId, // History key
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide available tools
        temperature: 0.5,
        maxToolCalls: 5 // Limit tool call loops
      });

      // Display the assistant's final response
      console.log(`\nKit Bot: ${result.content}\n`);

      // Display debug info if enabled
      if (client.isDebugMode()) {
          console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(8) : 'N/A'}, Reason: ${result.finishReason}`);
          if (result.reasoning) console.log(`[Debug] Reasoning: ${result.reasoning}`);
          if (result.annotations && result.annotations.length > 0) console.log(`[Debug] Annotations:`, result.annotations);
      }

      // Check the flag set by the acceptOrder tool
      if (orderAccepted) {
        console.log("Kit Bot: If you have any more questions, I'm here to help!");
        // Optionally break here if the dialog should end after ordering
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

An object passed to the constructor (`new OpenRouterClient(config)`). Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `apiEndpoint?` (string): Chat completions endpoint URL.
*   `apiBaseUrl?` (string): Base URL for auxiliary endpoints (e.g., `/models`, `/auth/key`). Defaults to `https://openrouter.ai/api/v1`.
*   `model?` (string): Default model for requests.
*   `debug?` (boolean): Enable verbose logging (default: `false`).
*   `proxy?` (string | object | null): HTTP/HTTPS proxy settings.
*   `referer?` (string): `HTTP-Referer` header value.
*   `title?` (string): `X-Title` header value.
*   `axiosConfig?` (object): Additional Axios configuration.
*   `historyAdapter?` (IHistoryStorage): **Required for history and analysis.** An instance of a history storage adapter (e.g., `new MemoryHistoryStorage()`).
*   `historyTtl?` (number): Cache TTL for history entries in `UnifiedHistoryManager` (milliseconds).
*   `historyCleanupInterval?` (number): Cleanup interval for expired cache entries in `UnifiedHistoryManager` (milliseconds).
*   `defaultProviderRouting?` (ProviderRoutingConfig): Default provider routing rules.
*   `modelFallbacks?` (string[]): Default list of fallback models.
*   `responseFormat?` (ResponseFormat | null): Default response format.
*   `maxToolCalls?` (number): Default maximum tool call loops per `chat()` call (default: 10).
*   `strictJsonParsing?` (boolean): Throw error on invalid JSON response (if JSON format requested)? (default: `false`, returns `null`).
*   `security?` (SecurityConfig): Security module configuration.
*   `enableCostTracking?` (boolean): Enable cost tracking (default: `false`).
*   `priceRefreshIntervalMs?` (number): Interval for refreshing model prices (default: 6 hours).
*   `initialModelPrices?` (object): Initial model prices to avoid the first price fetch request.
*   *Deprecated fields:* `historyStorage`, `chatsFolder`, `maxHistoryEntries`, `historyAutoSave`, `enableReasoning`, `webSearch`.

##### Core Methods

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: The main method for sending chat requests. Accepts request options (see below).
*   `getHistoryManager(): UnifiedHistoryManager`: Returns the history manager.
*   `getHistoryAnalyzer(): HistoryAnalyzer`: **(New)** Returns the history analyzer.
*   `getSecurityManager(): SecurityManager | null`: Returns the security manager.
*   `getCostTracker(): CostTracker | null`: Returns the cost tracker.
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches the credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cached model prices.
*   `refreshModelPrices(): Promise<void>`: Forces an update of the model price cache.
*   `createAccessToken(userInfo, expiresIn?): string`: Generates a JWT (if configured).
*   `use(plugin): Promise<void>`: Registers a plugin.
*   `useMiddleware(fn): void`: Registers middleware.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events (`'error'`, `'security:*'`, etc.).
*   `destroy(): Promise<void>`: Releases resources.

##### `client.chat` Request Options (`OpenRouterRequestOptions`)

Options passed to `client.chat()` to configure a specific request:

*   `prompt?` (string): Simple user text prompt. **Either** `prompt` **or** `customMessages` **is required**.
*   `customMessages?` (Message[] | null): Full array of messages to send (overrides `prompt` and history). **Either** `prompt` **or** `customMessages` **is required**.
*   `user?` (string): User ID for automatic history management (requires `historyAdapter`).
*   `group?` (string | null): Group ID for history (used with `user`).
*   `systemPrompt?` (string | null): System prompt for the request.
*   `accessToken?` (string | null): Access token for security checks.
*   `model?` (string): Model ID for this request (overrides default). Can use `:online` suffix to activate web search.
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

The `client.chat()` method returns a `Promise` that resolves to a `ChatCompletionResult` object with these fields:

*   `content` (any): The final response content from the model (string, JSON object, etc.).
*   `usage` (UsageInfo | null): Total tokens used (prompt + completion, including tool calls).
*   `model` (string): ID of the model that generated the final response.
*   `toolCallsCount` (number): Total number of successful tool calls made during the request.
*   `finishReason` (string | null): Reason the final generation step finished (`'stop'`, `'length'`, `'tool_calls'`, `'content_filter'`, `null`).
*   `durationMs` (number): Total execution time of the `chat()` request in milliseconds.
*   `id?` (string): ID of the final generation step from the OpenRouter API.
*   `cost?` (number | null): Calculated approximate cost of the request (if `enableCostTracking: true`).
*   `reasoning?` (string | null): Model's reasoning steps (if requested and returned).
*   `annotations?` (UrlCitationAnnotation[]): Array of annotations (e.g., web search citations) related to the final response.

#### 🧩 Plugins and Middleware

*   **Plugins:** Modules extending client functionality. Registered via `client.use(plugin)`. Can initialize services, replace standard managers (`setSecurityManager`, `setCostTracker`), add middleware.
*   **Middleware:** Functions executed sequentially for each `client.chat()` call. Allow modifying the request (`ctx.request`), response (`ctx.response`), or performing side effects (logging, auditing). Registered via `client.useMiddleware(fn)`.

#### 📜 History Management (Adapters & Analysis)

To enable automatic dialog history management and analysis, **`historyAdapter` must be configured** in `OpenRouterConfig`.

*   **Storage Format (`HistoryEntry`):** The library saves `HistoryEntry` objects, containing the `message` and associated API call `apiCallMetadata`. This enables precise tracking of models, tokens, and cost per turn.
*   **Adapter (`IHistoryStorage`):** Defines the interface for storage (`load`, `save`, `delete`, `listKeys`, `destroy?`), operating on `HistoryEntry[]`.
*   **`UnifiedHistoryManager`:** Internal component using the adapter, managing in-memory caching of `HistoryEntry`. Provides `getHistoryEntries`, `addHistoryEntries`, `getHistoryMessages`.
*   **Built-in Adapters:** `MemoryHistoryStorage`, `DiskHistoryStorage`.
*   **Usage:**
    ```typescript
    import { OpenRouterClient, MemoryHistoryStorage } from 'openrouter-kit';
    const client = new OpenRouterClient({ /*...,*/ historyAdapter: new MemoryHistoryStorage() });
    ```
*   **Redis Plugin:** Use `createRedisHistoryPlugin`.
*   **History Analysis (`HistoryAnalyzer`):**
    *   Access via `client.getHistoryAnalyzer()`.
    *   Use methods `getStats()`, `getCostOverTime()`, `getTokenUsageByModel()` for aggregated data.
    *   Methods accept optional `HistoryQueryOptions` for filtering records before analysis (by date, models, etc.).

#### 🛠️ Tool Handling (Function Calling)

Allows LLM models to call your custom functions.

1.  **Define Tool (`Tool`):** Create an object with `type: 'function'`, `function: { name, description?, parameters? }` (JSON Schema for arguments), and your `execute: (args, context?) => Promise<any> | any` function. Optionally add `security` rules.
2.  **Use in `client.chat()`:** Pass an array of tools in `options.tools`. The library automatically:
    *   Sends definitions to the model.
    *   Intercepts tool call requests (`finish_reason: 'tool_calls'`).
    *   Parses and validates arguments.
    *   **Performs security checks** (`SecurityManager`).
    *   Calls your `execute` function.
    *   **Sends the result (or a structured error) back to the model.**
    *   Returns the final model response to the user.
3.  **Result:** Final response in `ChatCompletionResult.content`, number of calls in `ChatCompletionResult.toolCallsCount`.

#### 🔒 Security Module (`SecurityManager`)

Activated by passing a `security: SecurityConfig` object to the `OpenRouterClient` constructor. Provides authentication, access control, rate limiting, and argument sanitization for tool calls. Requires careful configuration, especially `userAuthentication.jwtSecret`. **The default Rate Limiter is not suitable for distributed systems.**

#### 📈 Cost Tracking

Enabled via `enableCostTracking: true`. Calculates the **approximate** cost of API calls based on `usage` data and cached model prices. Provides `getCreditBalance()`, `getModelPrices()`, `refreshModelPrices()`. Cost is also saved in history metadata (`ApiCallMetadata.cost`) per step.

#### 🔄 Routing (Models & Providers)

*   **Models:** Set fallback models in `OpenRouterConfig` (`modelFallbacks`) or per request in `OpenRouterRequestOptions` (`models`). The request `models` list takes priority.
*   **Providers:** Control provider selection via `defaultProviderRouting` in `OpenRouterConfig` or `provider` in `OpenRouterRequestOptions`. The request `provider` option overrides the default. Allows setting order (`order`), enabling/disabling fallbacks (`allow_fallbacks`), ignoring providers (`ignore`), requiring parameter support (`require_parameters`), filtering by data policy (`data_collection`) or quantization (`quantizations`), and sorting (`sort`).

#### 🌐 Web Search

*   **Activation:**
    *   Append the `:online` suffix to the model name in `options.model` (e.g., `'openai/gpt-4o-mini:online'`).
    *   Or pass the plugin in `options.plugins`: `plugins: [{ id: 'web' }]`. You can also configure `max_results` and `search_prompt`: `plugins: [{ id: 'web', max_results: 3 }]`.
*   **Result:** The final model response may incorporate web search results. Source links are available in `ChatCompletionResult.annotations`.

#### 🤔 Reasoning Tokens

*   **Request:** Pass a `reasoning` object in `options` of `client.chat()`.
    *   `effort`: `'low'`, `'medium'`, or `'high'`.
    *   `max_tokens`: Number of tokens allocated for reasoning.
    *   `exclude`: `true` to have the model reason but exclude it from the response.
*   **Result:** Reasoning steps are available in `ChatCompletionResult.reasoning` (if `exclude: false`).

#### ⚙️ Response Format (`responseFormat` & Structured Outputs)

Request JSON responses for easier data processing.

*   **Configuration:** Use the `responseFormat` option in `OpenRouterConfig` (for default) or `OpenRouterRequestOptions` (per request).
*   **Types:**
    *   `{ type: 'json_object' }`: Model should return any valid JSON object.
    *   `{ type: 'json_schema', json_schema: { name: string, schema: object, strict?: boolean, description?: string } }`: Model should return JSON matching your schema.
*   **Parsing Errors:** Behavior on invalid JSON depends on `strictJsonParsing` setting (`false` returns `null`, `true` throws `ValidationError`).
*   **⚠️ Compatibility Warning:** Not all models support using `responseFormat` and `tools` simultaneously. Check OpenRouter documentation or experiment. If needed, create a tool that returns the desired JSON structure.

#### ⚠️ Error Handling

Use `try...catch` and check errors using `instanceof` or `error.code` (`ErrorCode`). Subscribe to the client's `'error'` event for global logging.

#### 📝 Logging

Enabled via `debug: true`. Uses `console` with component prefixes.

#### 🌐 Proxy

Configured via the `proxy` option (URL string or object `{ host, port, user?, pass? }`) in `OpenRouterConfig`.

### 📄 License

[MIT](./LICENSE)