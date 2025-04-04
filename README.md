# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful and easy-to-use TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies sending requests to LLMs, automatically manages chat history, handles tool calls (function calling), provides a robust security module, and allows tracking request costs.

## 🚀 Key Features

*   **🤖 Universal Chat:** Simple API (`client.chat`) for interacting with any model available via OpenRouter.
    *   Returns a structured `ChatCompletionResult` object with content (`content`), token usage information (`usage`), model used (`model`), number of tool calls (`toolCallsCount`), finish reason (`finishReason`), execution time (`durationMs`), request ID (`id`), and **calculated cost** (`cost`, optional).
*   **📜 History Management:** Automatic loading, saving, and trimming of chat history for each user or group.
    *   Flexible history system based on **adapters** (`IHistoryStorage`).
    *   Includes adapters for memory and disk (JSON files).
    *   Allows plugging in custom adapters (Redis, Mongo, API, etc.).
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for invoking your functions by the model.
    *   Define tools with JSON Schema for argument validation.
    *   Automatic parsing, schema validation, and **security checks** of arguments.
    *   Executes your `execute` functions with context passing (including `userInfo`).
    *   Automatically sends results back to the model to get the final response.
    *   Configurable limit on the maximum number of tool call rounds (`maxToolCalls`) to prevent infinite loops.
*   **🛡️ Security Module:** Comprehensive protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching). Easily extensible for other methods.
    *   **Access Control (ACL):** Flexible configuration of tool access based on roles, API keys, permissions (scopes), or explicit `allow`/`deny` rules.
    *   **Rate Limiting:** Apply call limits for tools per user or role.
    *   **Argument Sanitization:** Checks tool arguments for potentially harmful patterns (SQLi, XSS, command injection, etc.) with customization and audit mode.
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, etc.) for monitoring and logging.
*   **📈 Cost Tracking:** (Optional)
    *   Automatic calculation of the approximate cost for each `chat` call based on token usage data and OpenRouter model prices.
    *   Periodic updates of model prices from the OpenRouter API.
    *   `getCreditBalance()` method to check the current credit balance.
*   **⚙️ Flexible Configuration:** Configure API key, default model, endpoint, timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limit (`maxToolCalls`), cost tracking (`enableCostTracking`), and more.
*   **💡 Typing:** Fully written in TypeScript, providing autocompletion and type checking.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, etc.) with codes and details.
*   **📝 Logging:** Built-in flexible logger with prefix support and debug mode.
*   **✨ Ease of Use:** High-level API hiding the complexity of LLM and tool interactions.
*   **🧹 Resource Management:** `destroy()` method for correctly releasing resources (timers, caches, handlers) in long-running applications.
*   **🧩 Plugin System:** Extend client capabilities without modifying the core.
    *   Supports connecting external and custom plugins via `client.use(plugin)`.
    *   Plugins can add middleware, replace managers, subscribe to events, and extend the API.
*   **🔗 Middleware Chain:** Flexible request and response processing.
    *   Add middleware functions via `client.useMiddleware(fn)`.
    *   Middleware can modify requests, responses, implement auditing, access control, logging, cost limiting, etc.

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

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  enableCostTracking: true, // Optional: enable cost calculation
});

async function main() {
  try {
    const result = await client.chat({ // Gets a ChatCompletionResult object
      prompt: 'Say hello!',
      model: 'google/gemini-2.0-flash-001', // Optionally override the model
    });

    console.log('Model Response:', result.content); // Access content via .content
    console.log('Tokens Used:', result.usage);
    console.log('Model Used:', result.model);
    console.log('Tool Calls Count:', result.toolCallsCount);
    console.log('Finish Reason:', result.finishReason);
    console.log('Duration (ms):', result.durationMs);
    if (result.cost !== null) {
      console.log('Estimated Cost (USD):', result.cost);
    }

    // Example of fetching balance
    const balance = await client.getCreditBalance();
    console.log(`Credit Balance: $${balance.usage.toFixed(4)} used out of $${balance.limit.toFixed(2)} limit`);

  } catch (error: any) {
    console.error(`Error: ${error.message}`, error.details || error);
  } finally {
    await client.destroy(); // Important to release resources
  }
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit"); // Use named import

const client = new OpenRouterClient({ // Use the imported class name
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
  enableCostTracking: true, // Optional
});

async function main() {
  try {
    const result = await client.chat({ prompt: 'Hello, world!' });
    console.log('Model Response:', result.content);
    console.log('Usage:', result.usage);
    console.log('Cost:', result.cost);
  } catch (error) {
     console.error(`Error: ${error.message}`, error.details || error);
  } finally {
     await client.destroy();
  }
}

main();
```

## More Advanced Example (Taxi Bot)

```javascript
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline');

// Example proxy configuration (if needed)
// const proxyConfig = {
//   host: "your.proxy.server",
//   port: 8080,
//   user: "proxy_user", // optional
//   pass: "proxy_pass", // optional
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001", // Use an up-to-date model
  historyStorage: "memory", // Use memory adapter for history
  // proxy: proxyConfig, // Uncomment if using a proxy
  enableCostTracking: true, // Enable cost calculation
  // debug: true // Uncomment for detailed logs
});

let orderAccepted = false; // Global variable for simplicity in this example

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
          from: { type: "string", description: "Departure address" },
          to: { type: "string", description: "Destination address" }
        },
        required: ["from", "to"]
      },
    },
    // The function that will be executed
    execute: async (args) => {
      console.log(`[Tool] Calculating cost from ${args.from} to ${args.to}`);
      const cost = Math.floor(Math.random() * 900) + 100; // Simulating calculation
      return {
        from: args.from,
        to: args.to,
        estimatedCost: cost,
        currency: "USD" // Changed to USD for example consistency
      };
    }
  },
  {
    type: "function",
    function: {
      name: "acceptOrder",
      description: "Accepts the taxi order and assigns a driver.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Departure address" },
          to: { type: "string", description: "Destination address" }
        },
        required: ["from", "to"]
      },
    },
    // The function that will be executed
    execute: async (args) => {
      console.log(`[Tool] Accepting order from ${args.from} to ${args.to}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Updating global state
      // Returning a string confirming the action
      return `Order accepted. Driver ${driverNumber} is on the way to pick you up at ${args.from}. Destination: ${args.to}`;
    }
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

const systemPrompt = `You are a helpful taxi service operator. Your goal is to help the customer order a taxi.
You can ask clarifying questions if the customer hasn't provided the addresses.
First, estimate the ride cost using 'estimateRideCost'.
After the user confirms the cost, use 'acceptOrder' to book the ride.`;

async function chatWithTaxiBot() {
  const userId = "taxi_user_1";
  console.log("Bot: Hello! Welcome to the OpenRouterKit taxi service. How can I help you?");

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'quit') break;

      const result = await client.chat({ // Gets ChatCompletionResult
        user: userId, // Enable history for this user
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide tools
        temperature: 0.6,
        maxToolCalls: 5 // Limit the number of tool call rounds
      });

      console.log(`\nBot: ${result.content}\n`); // Access response via .content
      console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(6) : 'N/A'}`);

      if (orderAccepted) {
        console.log("Bot: Your taxi order has been successfully placed. Have a nice trip!");
      }
    }
  } catch (error) {
    console.error("Error:", error.message, error.details || error);
  } finally {
    rl.close();
    await client.destroy(); // Important: releasing client resources
  }
}

// Starting the bot
chatWithTaxiBot();
```

## 📚 Core Concepts

### `OpenRouterClient`

This is your main interface for working with the library.

**Configuration (`OpenRouterConfig`)**:

When creating `new OpenRouterClient(config)`, a `config` object is passed. Key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key. **Recommended to use environment variables.**
*   `model` (string, optional): Default model (default: see `config.ts`, e.g., `google/gemini-flash-1.5`).
*   `debug` (boolean, optional): Enable detailed logging (default: `false`).
*   `historyAdapter` (IHistoryStorage | 'memory' | 'file', optional): Custom history adapter (memory, disk, Redis, API, etc.) or a string ('memory', 'file'). Defaults to no history.
*   `historyAutoSave` (boolean, optional): Auto-save history on process exit (if the adapter supports it).
*   `historyTtl` (number, optional): History entry TTL in ms (default: 24 hours).
*   `historyCleanupInterval` (number, optional): History cleanup interval in ms (default: 1 hour).
*   `maxHistoryEntries` (number, optional): Maximum number of *messages* (not pairs) in history (default: 40).
*   `maxToolCalls` (number, optional): Maximum number of tool call rounds per `chat()` call (default: 10).
*   `security` (SecurityConfig, optional): Security module configuration (see below). **Important for tool handling!**
*   `proxy` (string | object, optional): HTTP/HTTPS proxy settings (URL string or `{ host, port, user?, pass? }`).
*   `apiEndpoint` (string, optional): OpenRouter chat API URL (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `referer`, `title` (string, optional): `HTTP-Referer` and `X-Title` headers (for OpenRouter stats).
*   `modelFallbacks` (string[], optional): List of fallback models to try if the primary one fails.
*   `responseFormat` (ResponseFormat, optional): Default response format (e.g., `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, optional): Strict JSON parsing/validation mode for responses (default: `false`). If `true`, throws an error for invalid JSON; if `false`, returns `null` in the `content` field.
*   `axiosConfig` (AxiosRequestConfig, optional): Additional settings for Axios (e.g., custom headers, timeouts).
*   `enableCostTracking` (boolean, optional): Enable calculation of call costs (default: `false`).
*   `priceRefreshIntervalMs` (number, optional): Interval for refreshing model prices in ms (default: 6 hours).
*   `initialModelPrices` (Record<string, ModelPricingInfo>, optional): Provide initial model prices to avoid the first API request.

**Key Methods**:

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Sends a request to the model. Handles history and tool calls automatically.
    *   `options.prompt` (string): User's prompt (or use `customMessages`).
    *   `options.customMessages` (Message[] | null): Provide the full message history instead of `prompt`.
    *   `options.user` (string): User ID for history management.
    *   `options.tools` (Tool[]): List of available tools.
    *   `options.accessToken` (string): JWT access token (if using `SecurityManager`).
    *   `options.maxToolCalls` (number): Override the tool call limit for this request.
    *   ... and other API parameters (`model`, `systemPrompt`, `temperature`, `maxTokens`, `responseFormat`, etc.).
    *   Returns `Promise<ChatCompletionResult>` - an object with fields:
        *   `content`: Final model response (string, object, or `null`).
        *   `usage`: Total token usage (`{ prompt_tokens, completion_tokens, total_tokens }` or `null`).
        *   `model`: ID of the model that generated the final response.
        *   `toolCallsCount`: Total number of tool calls executed.
        *   `finishReason`: Reason why the final response generation finished.
        *   `durationMs`: Total execution time of `chat()` in milliseconds.
        *   `id`: ID of the last request to the API.
        *   `cost`: Calculated cost (USD) or `null` if tracking is disabled or prices are unknown.
*   `setModel(model: string)`: Sets the default model.
*   `setApiKey(apiKey: string)`: Updates the API key.
*   `createAccessToken(userInfo, expiresIn?)`: Creates a JWT (requires `SecurityManager` with JWT).
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches the current OpenRouter credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns cached model prices.
*   `refreshModelPrices(): Promise<void>`: Force-refreshes the model price cache.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events (`'error'`, security events).
*   `getHistoryManager()`: Access the history manager.
*   `getSecurityManager()`: Access the security manager.
*   `getCostTracker()`: Access the cost tracker (if enabled).
*   `destroy(): Promise<void>`: **IMPORTANT!** Releases resources (timers, caches, handlers). **Call this when you are finished using the client**, especially in long-running server applications, to prevent memory and resource leaks.

### 🧩 Plugins and Middleware

**Plugins (`client.use(plugin)`):**

*   Allow extending or modifying client behavior without changing the core.
*   A plugin is an object with an `init(client)` method that receives the `OpenRouterClient` instance.
*   Inside `init()`, a plugin can:
    *   Add middleware (`client.useMiddleware`)
    *   Subscribe to events (`client.on`)
    *   Replace or extend managers (history, security, cost)
    *   Add its own methods, properties, APIs
*   Multiple plugins can be connected; the call order is preserved.

**Example of a Simple Plugin:**

```typescript
const myPlugin = {
  async init(client) {
    console.log('Plugin initialized');
    client.useMiddleware(async (ctx, next) => {
      console.log('My middleware: request', ctx.request.options);
      await next();
      console.log('My middleware: response', ctx.response);
    });
  }
};

await client.use(myPlugin);
```

**Middleware (`client.useMiddleware(fn)`):**

*   Allow centralized processing, modification, or blocking of requests and responses.
*   Use the familiar Express/Koa model: `(ctx, next) => { ... }`
*   Can:
    *   Modify `ctx.request.options` before sending
    *   Process or modify `ctx.response` after receiving
    *   Implement auditing, logging, cost limiting, access control, tracing, caching, etc.
*   Called in the order of registration (`client.useMiddleware(fn)`).
*   The built-in middleware chain already wraps the `chat()` call.

**Example Middleware for Auditing:**

```typescript
client.useMiddleware(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[AUDIT] Request to model ${ctx.request.options.model} took ${duration} ms`);
  if (ctx.response?.error) {
    console.warn(`[AUDIT] Error: ${ctx.response.error.message}`);
  } else {
    console.log(`[AUDIT] Response:`, ctx.response?.result?.content);
  }
});
```

*Middleware and plugins are the foundation for extensibility, integration, and customization of OpenRouter Kit.*

### 📜 History Management (adapters)

The library automatically loads and saves history if `user` (and optionally `group`) is passed in `client.chat()`.

*   **Automation:** No need to manually construct the `messages` array unless full control is needed (`customMessages`).
*   **Flexible Architecture:** History is stored via an `IHistoryStorage` adapter.
*   **Included:** Adapters for memory (`'memory'`) and disk (`'file'`) (JSON files).
*   **Custom Adapters:** You can plug in your own (Redis, MongoDB, REST API, etc.).
*   **Configuration:** TTL, limits, auto-saving - via client config.

**Example of Using History (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';

// Use 'memory' adapter by passing the string
const client = new OpenRouter({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
const userId = 'user-xyz';

async function chatWithHistory(prompt: string) {
  console.log(`> User (${userId}): ${prompt}`);
  // Just pass the user ID, the library handles the rest
  const result = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${result.content}`); // Access response via .content
  return result.content;
}

async function runConversation() {
  await chatWithHistory('My favorite color is blue.');
  await chatWithHistory('What is my favorite color?'); // The model should remember
  await client.destroy();
}

runConversation();
```

### 🛠️ Tool Handling (Function Calling)

Allows models to call your functions.

**1. Defining a Tool (`Tool`)**:
Define the tool using the `Tool` interface. Key fields: `type: 'function'`, `function.name`, `function.parameters` (JSON Schema), and `execute` (your function).

```typescript
import { Tool, ToolContext } from 'openrouter-kit';

// Example of a simple function
async function getUserData(userId: string): Promise<{ id: string; name: string; email: string } | null> {
  console.log(`[Tool] Fetching data for user ${userId}`);
  // Simulating data retrieval
  if (userId === '123') {
    return { id: userId, name: 'Alice', email: 'alice@example.com' };
  }
  return null;
}

// Tool Definition
const getUserDataTool: Tool = {
  type: 'function',
  function: {
    name: 'getUserData',
    description: 'Gets user data by their ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The ID of the user to fetch.' },
      },
      required: ['userId'],
    },
  },
  // Your function that will be called
  execute: async (args: { userId: string }, context?: ToolContext) => {
    console.log(`Executing getUserData initiated by user: ${context?.userInfo?.userId || 'unknown'}`);
    const userData = await getUserData(args.userId);
    if (!userData) {
      // It's recommended to return an object describing the result
      return { error: 'User not found' };
    }
    return userData; // Returns { id: '123', name: 'Alice', email: 'alice@example.com' }
  },
  security: {
      // requiredRole: 'admin', // Example access restriction
  }
};
```

**2. Using Tools in `chat()`**:
Pass an array of tools in `client.chat({ tools: [...] })`. The library handles the entire cycle: sending definitions -> receiving call request -> parsing arguments -> validating schema -> checking security -> calling `execute` -> sending result -> receiving final response. You can limit the number of tool call rounds using `maxToolCalls`.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';
// import { getUserDataTool } from './tools'; // Assuming the tool is defined in another file

async function findUser() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' /*, security: securityConfig */ });
  try {
    const result = await client.chat({
      prompt: "Get the data for the user with ID 123.",
      tools: [getUserDataTool], // Pass the tool
      maxToolCalls: 3 // Limit to 3 rounds of calls
    });
    console.log('Final response:', result.content); // e.g., "Data for user 123: Name: Alice, Email: alice@example.com."
    console.log('Tool calls:', result.toolCallsCount);
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await client.destroy();
  }
}

findUser();
```

### 🔒 Security Module (`SecurityManager`)

Activated by passing a `security: SecurityConfig` object to the `OpenRouterClient` constructor. **Highly recommended when working with tools**, especially if they perform actions or access sensitive data.

**Key Configuration Aspects (`SecurityConfig`):**

*   `defaultPolicy`: `'deny-all'` (recommended) or `'allow-all'`. Determines access to tools if no explicit rules exist.
*   `requireAuthentication`: `true` - require a valid `accessToken` for ANY request involving tools.
*   `allowUnauthenticatedAccess`: `true` - allow tool calls without an `accessToken` (if `requireAuthentication: false` and the tool is allowed for anonymous users).
*   `userAuthentication`: Authentication settings (e.g., `{ type: 'jwt', jwtSecret: 'YOUR_STRONG_SECRET' }`). **Never use default secrets in production!**
*   `toolAccess`: Access rules for each tool (`allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`).
*   `roles`: Definition of roles and their permissions/limits.
*   `dangerousArguments`: Argument checking configuration (`blockedValues`, `globalPatterns`, `toolSpecificPatterns`, `extendablePatterns`, `auditOnlyMode`).

**Example Configuration and Usage (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';
import type { SecurityConfig } from 'openrouter-kit'; // Use named import for the type

const jwtSecret = process.env.JWT_SECRET || 'very-secret-key-CHANGE-ME'; // Use env var!

const securityConfig: SecurityConfig = {
  debug: process.env.NODE_ENV === 'development', // Logs in development
  defaultPolicy: 'deny-all',
  requireAuthentication: true, // Token required for tool calls

  userAuthentication: {
    type: 'jwt',
    jwtSecret: jwtSecret,
  },

  toolAccess: {
    // Allow getCurrentWeather only for 'user' role, limit 10/min
    'getCurrentWeather': {
      allow: true,
      roles: ['user'],
      rateLimit: { limit: 10, period: 'minute' }
    },
    // Allow adminAction only for 'admin' role
    'adminAction': {
      allow: true,
      roles: ['admin'],
    }
  },

  dangerousArguments: {
    auditOnlyMode: false, // Block dangerous arguments
    extendablePatterns: [/custom_danger_pattern/i], // Add custom patterns
  }
};

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  security: securityConfig
});

// --- Usage ---

// Assume weatherTool is defined elsewhere
declare const weatherTool: any;

async function secureToolCall() {
  try {
    // 1. Token creation (e.g., after user login)
    const userInfo = { userId: 'alice-456', role: 'user' };
    const accessToken = client.createAccessToken(userInfo, '1h'); // Creating JWT for 1 hour

    // 2. Chat call with token
    const result = await client.chat({ // Gets ChatCompletionResult
      prompt: 'What is the weather in Paris?',
      tools: [weatherTool], // weatherTool - defined elsewhere
      accessToken: accessToken // Pass the token
    });
    console.log('Response:', result.content); // Access via .content

  } catch (e: any) {
    // Handling specific security errors
    console.error(`Security/Chat Error: ${e.message} (Code: ${e.code})`, e.details);
  } finally {
    await client.destroy();
  }
}

// Subscribing to security events
client.on('access:denied', (event) => {
  console.warn(`[Event] Access Denied: User ${event.userId} to ${event.toolName}. Reason: ${event.reason}`);
});

secureToolCall();
```

### 📈 Cost Tracking

The library can automatically calculate the approximate cost of each `client.chat()` call based on token usage data and OpenRouter model prices.

**Enabling:**

Set `enableCostTracking: true` in the client configuration:

```typescript
const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  enableCostTracking: true, // Enable tracking
  // priceRefreshIntervalMs: 4 * 60 * 60 * 1000 // Optional: refresh prices every 4 hours (default is 6)
});
```

**How it Works:**

1.  On initialization (or periodically), the client requests current model prices from the OpenRouter API `/models` endpoint.
2.  Prices are cached in memory.
3.  After each successful `chat` call, the library uses the `usage` data (token counts) and cached prices to calculate the cost.

**Result:**

If tracking is enabled, the `ChatCompletionResult` object returned by the `chat` method will contain a `cost` field (type `number | null`):

```typescript
const result = await client.chat({ prompt: 'Hello!' });

console.log('Content:', result.content);
console.log('Usage:', result.usage);
console.log('Model:', result.model);
console.log('Estimated Cost (USD):', result.cost); // <-- New field
```

**Getting Credit Balance:**

You can check the current credit balance associated with your API key:

```typescript
try {
  const balance = await client.getCreditBalance();
  console.log(`Credit Limit: $${balance.limit.toFixed(2)}`);
  console.log(`Current Usage: $${balance.usage.toFixed(2)}`);
  console.log(`Remaining: $${(balance.limit - balance.usage).toFixed(2)}`);
} catch (error) {
  console.error("Failed to get credit balance:", error);
}
```

**Managing Model Prices:**

*   `client.getModelPrices(): Record<string, ModelPricingInfo>`: Get the current model price cache.
*   `client.refreshModelPrices(): Promise<void>`: Force-refresh the model price cache.

### ⚙️ Response Format (`responseFormat`)

Force the model to generate a response in JSON format.

*   `{ type: 'json_object' }`: Guarantees a valid JSON object.
*   `{ type: 'json_schema', json_schema: { name: '...', schema: { ... } } }`: Guarantees JSON matching your schema.

**Note:** When using `responseFormat` and `strictJsonParsing: false` (default), if the model returns invalid JSON or JSON not matching the schema, the `content` field in the `client.chat()` result will be `null`. If `strictJsonParsing: true`, a `ValidationError` will be thrown.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

async function getStructuredData() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' });
  try {
    const userSchema = {
      type: "object",
      properties: { name: { type: "string"}, age: {type: "number"} },
      required: ["name", "age"]
    };
    const result = await client.chat({ // Gets ChatCompletionResult
      prompt: 'Generate user data for Bob (age 42, lives in CA) according to the schema.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      },
      // strictJsonParsing: true // Optional: throw error on invalid JSON/schema
    });

    if (result.content) { // Check the content field
      console.log('Structured user data:', result.content);
      // Example Output: { "name": "Bob", "age": 42 }
    } else {
      console.log('The model did not return valid JSON matching the schema.');
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await client.destroy();
  }
}

getStructuredData();
```

### ⚠️ Error Handling

Catch errors using `try...catch` and check the error type via `instanceof` or the `error.code` field (see `ErrorCode` enum).

```typescript
import OpenRouter, { OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

const client = new OpenRouter({ apiKey: 'YOUR_KEY' });

try {
  // ... client.chat() call ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 0) / 1000);
    console.warn(`Rate limit exceeded! Try again in ${retryAfter} seconds.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Validation Error: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.TOOL_ERROR && error.message.includes('Maximum tool call depth')) {
     console.error(`Tool call limit reached: ${error.message}`);
  } else if (error instanceof OpenRouterError) { // Catching other library errors
    console.error(`OpenRouter Kit Error (${error.code}): ${error.message}`);
  } else {
    console.error(`Unknown Error: ${error.message}`);
  }
}
```

You can also listen for global client errors:
`client.on('error', (error) => { /* ... */ });`

### 🌐 Proxy

Configure the proxy in the client configuration:

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

// URL string format
const client1 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:pass@your-proxy.com:8080'
});

// Object format
const client2 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: { host: 'proxy.example.com', port: 8888, user: 'usr', pass: 'pwd' }
});
```

## 📄 License

[MIT](LICENSE)