# OpenRouter Kit

[![npm version](https://badge.fury.io/js/openrouter-kit.svg)](https://badge.fury.io/js/openrouter-kit) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C/%3E-TypeScript-%230074C1.svg)](http://www.typescriptlang.org/)

[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

**OpenRouter Kit** is a powerful and convenient TypeScript/JavaScript library for interacting with the [OpenRouter API](https://openrouter.ai/). It simplifies sending requests to LLMs, automatically manages conversation history, handles tool calls (function calling), and provides a robust security module.

## 🚀 Key Features

*   **🤖 Universal Chat:** Simple API (`client.chat`) for interacting with any model available through OpenRouter.
*   **📜 History Management:** Automatic loading, saving, and trimming of conversation history for each user or group.
    *   Storage options: `memory` and `disk` (JSON files).
    *   Automatic cleanup based on TTL and maximum size limits.
    *   Reliable disk saving on Node.js process termination (optional).
*   **🛠️ Tool Handling (Function Calling):** Seamless integration for models calling your functions.
    *   Define tools with JSON Schema for argument validation.
    *   Automatic parsing, schema validation, and **security checks** for arguments.
    *   Execution of your `execute` functions with context (including `userInfo`).
    *   Automatic submission of results back to the model to get the final response.
*   **🛡️ Security Module:** Comprehensive protection for your applications.
    *   **Authentication:** Built-in JWT support (generation, validation, caching). Easily extensible for other methods.
    *   **Access Control (ACL):** Flexible configuration of tool access based on roles, API keys, scopes, or explicit rules (`allow`/`deny`).
    *   **Rate Limiting:** Apply call frequency limits for tools per user or role.
    *   **Argument Sanitization:** Checks tool arguments for potentially dangerous patterns (SQLi, XSS, command injection, etc.) with customization and audit mode.
    *   **Event System:** Subscribe to security events (`access:denied`, `ratelimit:exceeded`, `security:dangerous_args`, etc.) for monitoring and logging.
*   **⚙️ Flexible Configuration:** Set API key, default model, endpoint, timeouts, **proxy**, headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), etc.
*   **💡 Typing:** Fully written in TypeScript, providing autocompletion and type checking.
*   **🚦 Error Handling:** Clear hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, `RateLimitError`, etc.) with codes and details.
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
});

async function main() {
  const response = await client.chat({
    prompt: 'Say hi!',
    model: 'google/gemini-2.0-flash-001',
  });
  console.log('Model response:', response);
}

main();
```

**JavaScript (CommonJS):**

```javascript
const { OpenRouterClient } = require("openrouter-kit");

const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-v1-...',
});

async function main() {
  const response = await client.chat({ prompt: 'Hello, world!' });
  console.log('Model response:', response);
}

main();
```

## A More Interesting Example (Taxi Bot)

```javascript
const { OpenRouterClient } = require("openrouter-kit");
const readline = require('readline');

// No proxy used in this example
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-or-v1-...",
  model: "google/gemini-2.0-flash-001",
  historyStorage: "memory",
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

      const response = await client.chat({
        user: userId, // Enable history for this user
        prompt: userMessage,
        systemPrompt: systemPrompt,
        tools: taxiTools, // Provide the tools
        temperature: 0.6,
      });

      console.log(`\nBot: ${response}\n`);

      if (orderAccepted) {
        console.log("Bot: Your taxi order has been successfully placed. Have a great ride!");
      }
    }
  } catch (error) {
    console.error("Error:", error);
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
*   `security` (SecurityConfig, optional): Security module configuration (see below). **Important for tool handling!**
*   `proxy` (string | object, optional): HTTP/HTTPS proxy settings (URL or `{ host, port, user?, pass? }`).
*   `apiEndpoint` (string, optional): OpenRouter API URL.
*   `referer`, `title` (string, optional): `HTTP-Referer` and `X-Title` headers (for OpenRouter stats).
*   `modelFallbacks` (string[], optional): List of fallback models to try if the primary fails.
*   `responseFormat` (ResponseFormat, optional): Default response format (e.g., `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, optional): Strict JSON parsing/validation mode for responses (default: `false`). If `true`, throws on invalid JSON; if `false`, returns `null`.
*   `axiosConfig` (AxiosRequestConfig, optional): Additional settings for Axios (e.g., custom headers, timeouts).

**Core Methods**:

*   `chat(options: OpenRouterRequestOptions): Promise<any>`: Sends a request to the model. Handles history and tool calls automatically.
    *   `options.prompt` (string): User's prompt.
    *   `options.user` (string): User ID for history management.
    *   `options.tools` (Tool[]): List of available tools.
    *   `options.accessToken` (string): JWT access token (if using `SecurityManager`).
    *   ...and other API parameters (`model`, `systemPrompt`, `temperature`, `maxTokens`, `responseFormat`, etc.).
    *   Returns: Model response (`string`), parsed object (`object` if JSON requested), or `null` (on JSON parse error with `strictJsonParsing: false`).
*   `setModel(model: string)`: Sets the default model.
*   `setApiKey(apiKey: string)`: Updates the API key.
*   `createAccessToken(userInfo, expiresIn?)`: Creates a JWT (requires JWT `SecurityManager`).
*   `on(event, handler)` / `off(event, handler)`: Subscribe/unsubscribe from events (`'error'`, security events).
*   `getHistoryManager()`: Access the history manager instance.
*   `getSecurityManager()`: Access the security manager instance.
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
  const response = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${response}`);
  return response;
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
Pass an array of tools to `client.chat({ tools: [...] })`. The library handles the entire cycle: sending definitions -> receiving call request -> parsing arguments -> validating schema -> security checks -> calling `execute` -> sending results -> getting the final response.

```typescript
// TypeScript Example
import OpenRouter from 'openrouter-kit';
// import { getUserDataTool } from './tools'; // Assuming tool is defined elsewhere

async function findUser() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' /*, security: securityConfig */ }); // Security config optional
  try {
    const response = await client.chat({
      prompt: "Get data for user with ID 123.",
      tools: [getUserDataTool] // Provide the tool definition
    });
    console.log('Final response:', response); // e.g., "The data for user 123 is: Name: Alice, Email: alice@example.com."
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
    const response = await client.chat({
      prompt: 'What is the weather like in Paris?',
      tools: [/* weatherTool defined elsewhere */],
      accessToken: accessToken // Pass the token
    });
    console.log('Response:', response);

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

### ⚙️ Response Format (`responseFormat`)

Force the model to generate a response as JSON.

*   `{ type: 'json_object' }`: Ensures a valid JSON object.
*   `{ type: 'json_schema', json_schema: { name: '...', schema: { ... } } }`: Ensures JSON conforming to your schema.

**Note:** When using `responseFormat` with `strictJsonParsing: false` (default), if the model returns invalid JSON or JSON not matching the schema, `client.chat()` will return `null`. If `strictJsonParsing: true`, a `ValidationError` will be thrown.

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
    const userData = await client.chat({
      prompt: 'Generate user data for Bob (age 42, bob@domain.com) according to the schema.',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'UserData', schema: userSchema }
      },
      // strictJsonParsing: true // Optional: throw error on invalid JSON/schema
    });

    if (userData) {
      console.log('Structured User Data:', userData);
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
import { OpenRouterError, RateLimitError, ValidationError, ErrorCode } from 'openrouter-kit';

try {
  // ... client.chat() call ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    const retryAfter = Math.ceil((error.details?.timeLeft || 0) / 1000);
    console.warn(`Rate limit hit! Try again in ${retryAfter} seconds.`);
  } else if (error.code === ErrorCode.VALIDATION_ERROR) {
    console.error(`Validation failed: ${error.message}`, error.details);
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
