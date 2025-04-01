# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful and convenient TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies sending requests to LLMs, automatically manages conversation history, handles tool calls (function calling), provides a robust security module, and allows for cost tracking.

## 🚀 Key Features

*   **🤖 Universal Chat:** Simple API (`client.chat`) for interacting with any model available through OpenRouter.
    *   Returns a structured `ChatCompletionResult` object containing the response content (`content`), token usage (`usage`), model used (`model`), tool call count (`toolCallsCount`), finish reason (`finishReason`), execution duration (`durationMs`), request ID (`id`), and **calculated cost** (`cost`, optional).
*   **📜 History Management:** Automatic loading, saving, and trimming of conversation history for each user or group.
    *   Storage options: `memory` and `disk` (JSON files).
    *   Automatic cleanup based on TTL and maximum size limits.
    *   Reliable disk saving on Node.js process termination (optional).
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for models calling your functions.
    *   Define tools with JSON Schema for argument validation.
    *   Automatic parsing, schema validation, and **security checks** for arguments.
    *   Execution of your `execute` functions with context (including `userInfo`).
    *   Automatic submission of results back to the model to get the final response.
    *   Configurable limit on the maximum number of tool call rounds (`maxToolCalls`) to prevent loops.
*   **🛡️ Security Module:** Comprehensive protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching). Easily extensible for other methods.
    *   **Access Control (ACL):** Flexible configuration of tool access based on roles, API keys, scopes, or explicit rules (`allow`/`deny`).
    *   **Rate Limiting:** Apply call frequency limits for tools per user or role.
    *   **Argument Sanitization:** Checks tool arguments for potentially dangerous patterns (SQLi, XSS, command injection, etc.) with customization and audit mode.
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, etc.) for monitoring and logging.
*   **📈 Cost Tracking:** (Optional)
    *   Automatic calculation of estimated cost for each `chat` call based on token usage and OpenRouter model pricing.
    *   Periodic refresh of model prices from the OpenRouter API.
    *   `getCreditBalance()` method to check current credit balance.
*   **⚙️ Flexible Configuration:** Set API key, default model, endpoint, timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), tool call limits (`maxToolCalls`), cost tracking (`enableCostTracking`), etc.
*   **💡 Typing:** Fully written in TypeScript, providing autocompletion and type checking.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, `ToolError`, etc.) with codes and details.
*   **📝 Logging:** Built-in flexible logger with prefix support and debug mode.
*   **✨ Ease of Use:** High-level API hiding the complexity of interacting with LLMs and tools.
*   **🧹 Resource Management:** `destroy()` method for proper resource cleanup (timers, caches, handlers) in long-running applications.

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
  enableCostTracking: true, // Optional: Enable cost calculation
});

async function main() {
  try {
    const result = await client.chat({ // Gets ChatCompletionResult object
      prompt: 'Say hi!',
      model: 'google/gemini-2.0-flash-001', // Optionally override the model
    });

    console.log('Model response content:', result.content); // Access content via .content
    console.log('Usage:', result.usage);
    console.log('Model Used:', result.model);
    console.log('Tool Calls:', result.toolCallsCount);
    console.log('Finish Reason:', result.finishReason);
    console.log('Duration (ms):', result.durationMs);
    if (result.cost !== null) {
      console.log('Estimated Cost (USD):', result.cost);
    }

    // Example: Get credit balance
    const balance = await client.getCreditBalance();
    console.log(`Credit Balance: Used $${balance.usage.toFixed(4)} of $${balance.limit.toFixed(2)}`);

  } catch (error: any) {
    console.error(`Error: ${error.message}`, error.details || error);
  } finally {
    await client.destroy(); // Important: Release resources
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
    console.log('Model response content:', result.content);
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

## A More Interesting Example (Taxi Bot)

```javascript
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline');

// Example proxy config (if needed)
// const proxyConfig = {
//   host: "your.proxy.server",
//   port: 8080,
//   user: "proxy_user", // optional
//   pass: "proxy_pass", // optional
// };

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001", // Default model
  historyStorage: "memory",
  // proxy: proxyConfig, // Uncomment if using proxy
  enableCostTracking: true, // Enable cost calculation
  // debug: true // Uncomment for verbose logs
});

let orderAccepted = false; // Global state for simplicity in this example

// --- Tool Definitions ---
const taxiTools = [
  {
    type: "function",
    function: {
      name: "estimateRideCost",
      description: "Estimates the cost of a taxi ride between two locations.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Pickup address" },
          to: { type: "string", description: "Destination address" }
        },
        required: ["from", "to"]
      },
    },
     // The actual function to execute
    execute: async (args) => {
      console.log(`[Tool] Estimating cost from ${args.from} to ${args.to}`);
      const cost = Math.floor(Math.random() * 45) + 5; // Simulate cost calculation
      return {
        from: args.from,
        to: args.to,
        estimatedCost: cost,
        currency: "USD"
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
          from: { type: "string", description: "Pickup address" },
          to: { type: "string", description: "Destination address" }
        },
        required: ["from", "to"]
      },
    },
     // The actual function to execute
    execute: async (args) => {
      console.log(`[Tool] Accepting order from ${args.from} to ${args.to}`);
      const driverNumber = Math.floor(Math.random() * 100) + 1;
      orderAccepted = true; // Update global state
      // Return a string confirming the action
      return `Order accepted. Driver ${driverNumber} is on the way to pick you up from ${args.from}. Destination: ${args.to}`;
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
You can ask clarifying questions if the customer does not provide addresses.
First, estimate the cost using 'estimateRideCost'.
After the user confirms the cost, use 'acceptOrder' to book the ride.`;

async function chatWithTaxiBot() {
  const userId = "taxi_user_1";
  console.log("Bot: Hello! Welcome to OpenRouterKit Taxi service. How can I help you today?");

  try {
    while (!orderAccepted) {
      const userMessage = await askQuestion("You: ");
      if (userMessage.toLowerCase() === 'quit') break;

      const result = await client.chat({ // Get ChatCompletionResult
        user: userId, // Enable history for this user
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide the tools
        temperature: 0.6,
        maxToolCalls: 5 // Limit tool call rounds
      });

      console.log(`\nBot: ${result.content}\n`); // Access response via .content
      console.log(`[Debug] Model: ${result.model}, Tool Calls: ${result.toolCallsCount}, Cost: ${result.cost !== null ? '$' + result.cost.toFixed(6) : 'N/A'}`);

      if (orderAccepted) {
        console.log("Bot: Your taxi order has been successfully placed. Have a great ride!");
      }
    }
  } catch (error) {
    console.error("Error:", error.message, error.details || error);
  } finally {
    rl.close();
    await client.destroy(); // Important: Clean up client resources
  }
}

// Run the bot
chatWithTaxiBot();
```

## 📚 Core Concepts

### `OpenRouterClient`

This is your main entry point for interacting with the library.

**Configuration (`OpenRouterConfig`)**:

Passed to `new OpenRouterClient(config)`. Key fields include:

*   `apiKey` (string, **required**): Your OpenRouter API key. **Use environment variables.**
*   `model` (string, optional): Default model for requests (default: see `config.ts`, e.g., `google/gemini-2.0-flash-001`).
*   `debug` (boolean, optional): Enable verbose logging (default: `false`).
*   `historyStorage` ('memory' | 'disk', optional): History storage type (default: `memory`).
*   `historyAutoSave` (boolean, optional): Auto-save history on exit for `disk` (default: `false`).
*   `historyTtl` (number, optional): History entry lifetime in ms (default: 24 hours).
*   `historyCleanupInterval` (number, optional): Interval for history cleanup in ms (default: 1 hour).
*   `maxHistoryEntries` (number, optional): Maximum number of *messages* (not pairs) in history (default: 40).
*   `maxToolCalls` (number, optional): Default maximum tool call rounds per `chat()` call (default: 10).
*   `security` (SecurityConfig, optional): Security module configuration (see below). **Important for tool handling!**
*   `proxy` (string | object, optional): HTTP/HTTPS proxy settings (URL or `{ host, port, user?, pass? }`).
*   `apiEndpoint` (string, optional): OpenRouter API URL for chat completions (default: `https://openrouter.ai/api/v1/chat/completions`).
*   `referer`, `title` (string, optional): `HTTP-Referer` and `X-Title` headers (for OpenRouter stats).
*   `modelFallbacks` (string[], optional): List of fallback models to try if the primary fails.
*   `responseFormat` (ResponseFormat, optional): Default response format (e.g., `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, optional): Strict JSON parsing/validation mode for responses (default: `false`). If `true`, throws on invalid JSON; if `false`, returns `null` in the `content` field.
*   `axiosConfig` (AxiosRequestConfig, optional): Additional settings for Axios (e.g., custom headers, timeouts).
*   `enableCostTracking` (boolean, optional): Enable cost calculation for chat calls (default: `false`).
*   `priceRefreshIntervalMs` (number, optional): Interval to refresh model prices in ms (default: 6 hours).
*   `initialModelPrices` (Record<string, ModelPricingInfo>, optional): Provide initial model prices to avoid the first API fetch.

**Core Methods**:

*   `chat(options: OpenRouterRequestOptions): Promise<ChatCompletionResult>`: Sends a request to the model. Handles history and tool calls automatically.
    *   `options.prompt` (string): User's prompt (or use `customMessages`).
    *   `options.customMessages` (Message[] | null): Provide full message history instead of `prompt`.
    *   `options.user` (string): User ID for history management.
    *   `options.tools` (Tool[]): List of available tools.
    *   `options.accessToken` (string): JWT access token (if using `SecurityManager`).
    *   `options.maxToolCalls` (number): Override the default tool call limit for this request.
    *   ...and other API parameters (`model`, `systemPrompt`, `temperature`, `maxTokens`, `responseFormat`, etc.).
    *   Returns `Promise<ChatCompletionResult>` - an object containing:
        *   `content`: The final model response content (string, object, or `null`).
        *   `usage`: Cumulative token usage (`{ prompt_tokens, completion_tokens, total_tokens }` or `null`).
        *   `model`: ID of the model that generated the final response.
        *   `toolCallsCount`: Total number of tool calls executed.
        *   `finishReason`: The finish reason of the final response.
        *   `durationMs`: Total execution time for the `chat()` call in milliseconds.
        *   `id`: ID of the last completion request.
        *   `cost`: Estimated cost in USD (`number`) or `null` if tracking is disabled or prices are unavailable.
*   `setModel(model: string)`: Sets the default model.
*   `setApiKey(apiKey: string)`: Updates the API key.
*   `createAccessToken(userInfo, expiresIn?)`: Creates a JWT (requires JWT `SecurityManager`).
*   `getCreditBalance(): Promise<CreditBalance>`: Fetches the current OpenRouter credit balance.
*   `getModelPrices(): Record<string, ModelPricingInfo>`: Returns the cached model prices.
*   `refreshModelPrices(): Promise<void>`: Manually triggers a refresh of the model price cache.
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events (`'error'`, security events).
*   `getHistoryManager()`: Access the history manager instance.
*   `getSecurityManager()`: Access the security manager instance.
*   `getCostTracker()`: Access the cost tracker instance (if enabled).
*   `destroy(): Promise<void>`: **IMPORTANT!** Releases resources (timers, caches, handlers). **Call this when done with the client**, especially in server applications, to prevent memory/resource leaks.

### 📜 History Management (`HistoryManager`)

The library automatically loads and saves history if `user` (and optionally `group`) is provided in `client.chat()`.

*   **Automatic:** No need to manually construct the `messages` array unless you need full control (`customMessages`).
*   **Storage:** `memory` (fast, non-persistent) or `disk` (saves JSON to `./.openrouter-chats` by default).
*   **Configuration:** Control size (`maxHistoryEntries`), lifetime (`ttl`), cleanup interval (`cleanupInterval`), and auto-save (`historyAutoSave`) via client configuration.

**Example (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';

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
  await chatWithHistory('What is my favorite color?'); // Model should remember
  await client.destroy(); // Cleanup
}

runConversation();
```

### 🛠️ Tool Handling (Function Calling)

Allows models to call your functions.

**1. Define a Tool (`Tool`)**:
Define tools using the `Tool` interface. Key fields: `type: 'function'`, `function.name`, `function.parameters` (JSON Schema), and `execute` (your function).

```typescript
import { Tool, ToolContext } from 'openrouter-kit';

// Example simple function
async function getUserData(userId: string): Promise<{ id: string; name: string; email: string } | null> {
  console.log(`[Tool] Fetching data for user ${userId}`);
  // Simulate fetching data
  if (userId === '123') {
    return { id: userId, name: 'Alice', email: 'alice@example.com' };
  }
  return null;
}

// Tool definition
const getUserDataTool: Tool = {
  type: 'function',
  function: {
    name: 'getUserData',
    description: 'Fetches user data based on their ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The ID of the user to fetch.' },
      },
      required: ['userId'],
    },
  },
  // Your function to be called by the library
  execute: async (args: { userId: string }, context?: ToolContext) => {
    console.log(`Executing getUserData initiated by user: ${context?.userInfo?.userId || 'unknown'}`);
    const userData = await getUserData(args.userId);
    if (!userData) {
      // It's good practice to return an object describing the result
      return { error: 'User not found' };
    }
    return userData; // Will return { id: '123', name: 'Alice', email: 'alice@example.com' }
  },
  security: {
      // requiredRole: 'admin', // Example access restriction
  }
};
```

**2. Use Tools in `chat()`**:
Pass an array of tools to `client.chat({ tools: [...] })`. The library handles the entire cycle: sending definitions -> receiving call request -> parsing arguments -> validating schema -> security checks -> calling `execute` -> sending results -> getting the final response. You can limit the number of tool call rounds using `maxToolCalls`.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';
// import { getUserDataTool } from './tools'; // Assuming tool is defined elsewhere

async function findUser() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' /*, security: securityConfig */ });
  try {
    const result = await client.chat({ // Get ChatCompletionResult
      prompt: "Get data for user with ID 123.",
      tools: [getUserDataTool], // Provide the tool definition
      maxToolCalls: 3 // Limit to 3 rounds of calls
    });
    console.log('Final response:', result.content); // e.g., "The data for user 123 is: Name: Alice, Email: alice@example.com."
    console.log('Tool calls made:', result.toolCallsCount);
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await client.destroy();
  }
}

findUser();
```

### 🔒 Security Module (`SecurityManager`)

Activated by passing `security: SecurityConfig` to the `OpenRouterClient` constructor. **Highly recommended when using tools**, especially if they perform actions or access sensitive data.

**Key Configuration Aspects (`SecurityConfig`):**

*   `defaultPolicy`: `'deny-all'` (recommended) or `'allow-all'`. Determines access if no specific rule matches.
*   `requireAuthentication`: `true` - Require a valid `accessToken` for ANY request involving tools.
*   `allowUnauthenticatedAccess`: `true` - Allow tool calls without an `accessToken` (if `requireAuthentication: false` and the tool allows anonymous access).
*   `userAuthentication`: Auth settings (e.g., `{ type: 'jwt', jwtSecret: 'YOUR_STRONG_SECRET' }`). **Never use default secrets in production!**
*   `toolAccess`: Access rules per tool (`allow`, `roles`, `scopes`, `rateLimit`, `allowedApiKeys`).
*   `roles`: Definition of roles and their permissions/limits.
*   `dangerousArguments`: Argument checking setup (`blockedValues`, `globalPatterns`, `toolSpecificPatterns`, `extendablePatterns`, `auditOnlyMode`).

**Configuration and Usage Example (TypeScript):**

```typescript
import OpenRouter from 'openrouter-kit';
import type { SecurityConfig } from 'openrouter-kit'; // Use named import for type

const jwtSecret = process.env.JWT_SECRET || 'very-secret-key-CHANGE-ME'; // Use env var!

const securityConfig: SecurityConfig = {
  debug: process.env.NODE_ENV === 'development', // Enable logs in dev
  defaultPolicy: 'deny-all',
  requireAuthentication: true, // Require token for all tool calls

  userAuthentication: {
    type: 'jwt',
    jwtSecret: jwtSecret,
  },

  toolAccess: {
    // Allow weather tool only for 'user' role, limit 10/min
    'getCurrentWeather': {
      allow: true,
      roles: ['user'],
      rateLimit: { limit: 10, period: 'minute' }
    },
    // Allow admin tool only for 'admin' role
    'adminAction': {
      allow: true,
      roles: ['admin'],
    }
  },

  dangerousArguments: {
    auditOnlyMode: false, // Block dangerous args by default
    extendablePatterns: [/custom_danger_pattern/i], // Add custom patterns
  }
};

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  security: securityConfig
});

// --- Usage ---

async function secureToolCall() {
  try {
    // 1. Create token (e.g., after user login)
    const userInfo = { userId: 'alice-456', role: 'user' };
    const accessToken = client.createAccessToken(userInfo, '1h'); // Create JWT valid for 1 hour

    // 2. Call chat with the token
    const result = await client.chat({ // Get ChatCompletionResult
      prompt: 'What is the weather like in Paris?',
      tools: [/* weatherTool defined elsewhere */],
      accessToken: accessToken // Pass the token
    });
    console.log('Response:', result.content); // Access via .content

  } catch (e: any) {
    // Handle specific security errors
    console.error(`Security/Chat Error: ${e.message} (Code: ${e.code})`, e.details);
  } finally {
    await client.destroy();
  }
}

// Subscribe to security events
client.on('access:denied', (event) => {
  console.warn(`[Event] Access Denied: User ${event.userId} to ${event.toolName}. Reason: ${event.reason}`);
});

secureToolCall();
```

### 📈 Cost Tracking

The library can automatically calculate the estimated cost of each `client.chat()` call based on token usage and OpenRouter model pricing.

**Enabling:**

Set `enableCostTracking: true` in the client configuration:

```typescript
const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  enableCostTracking: true, // Enable tracking
  // priceRefreshIntervalMs: 4 * 60 * 60 * 1000 // Optional: Refresh prices every 4 hours (default is 6)
});
```

**How it works:**

1.  On initialization (or periodically), the client fetches current model prices from the OpenRouter API (`/models` endpoint).
2.  Prices are cached in memory.
3.  After each successful `chat` call, the library uses the returned `usage` data and cached prices to calculate the cost.

**Result:**

If enabled, the `ChatCompletionResult` object returned by `chat` will contain a `cost` field (type `number | null`):

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

*   `client.getModelPrices(): Record<string, ModelPricingInfo>`: Get the current cache of model prices.
*   `client.refreshModelPrices(): Promise<void>`: Force a refresh of the model price cache.

### ⚙️ Response Format (`responseFormat`)

Force the model to generate a response as JSON.

*   `{ type: 'json_object' }`: Ensures a valid JSON object.
*   `{ type: 'json_schema', json_schema: { name: '...', schema: { ... } } }`: Ensures JSON conforming to your schema.

**Note:** When using `responseFormat` with `strictJsonParsing: false` (default), if the model returns invalid JSON or JSON not matching the schema, the `content` field in the `client.chat()` result will be `null`. If `strictJsonParsing: true`, a `ValidationError` will be thrown.

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
    const result = await client.chat({ // Get ChatCompletionResult
      prompt: 'Generate user data for Bob (age 42, bob@domain.com) according to the schema.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      },
      // strictJsonParsing: true // Optional: throw error on invalid JSON/schema
    });

    if (result.content) { // Check the content field
      console.log('Structured User Data:', result.content);
    } else {
      console.log('Model did not return valid JSON conforming to the schema.');
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

Catch errors using `try...catch` and check the error type via `instanceof` or the `error.code` property (see `ErrorCode` enum).

```typescript
import { OpenRouterError, RateLimitError, ValidationError, ToolError, ErrorCode } from 'openrouter-kit';

try {
  // ... client.chat() call ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 0) / 1000);
    console.warn(`Rate limit hit! Try again in ${retryAfter} seconds.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Validation failed: ${error.message}`, error.details);
  } else if (error instanceof ToolError && error.message.includes('Maximum tool call depth')) {
     console.error(`Tool call limit reached: ${error.message}`);
  } else if (error instanceof OpenRouterError) { // Catch other library errors
    console.error(`OpenRouter Kit Error (${error.code}): ${error.message}`);
  } else {
    console.error(`Unknown error: ${error.message}`);
  }
}
```

You can also listen for global client errors:
`client.on('error', (error) => { /* ... */ });`

### 🌐 Proxy

Configure a proxy in the client options:

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';

// String URL format
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