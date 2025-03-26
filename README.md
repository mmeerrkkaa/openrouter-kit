
[🇷🇺 Русский](./README.ru.md) | **🇬🇧 English**
---

# OpenRouter Client Library

[![npm version](https://badge.fury.io/js/openrouter-client.svg)](https://badge.fury.io/js/openrouter-client) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A convenient TypeScript/JavaScript client for interacting with the [OpenRouter API](https://openrouter.ai/), providing:

*   A simple interface for querying various LLMs via `/chat/completions`.
*   Automatic conversation history management (in-memory or disk-based).
*   Handling of tool calls (function calling) requested by models.
*   A robust security module for authentication, access control, rate limiting, and tool argument validation.
*   Flexible configuration (API key, model, proxy, headers, etc.).
*   Typed errors and an event system.

## 🚀 Key Features

*   **Universal Chat:** Send requests to any model supported by OpenRouter.
*   **History Management:** Automatically save and inject conversation history for each user/group. Supports in-memory (`memory`) and disk (`disk`) storage with TTL and auto-cleanup.
*   **Tool Handling (Function Calling):**
    *   Define tools with JSON Schema for arguments.
    *   Automatic parsing and validation of arguments provided by the model.
    *   Execution of your functions (`execute`) with context (including user info).
    *   Sending tool execution results back to the model for a final response.
*   **Security Module:**
    *   **Authentication:** JWT support (creation, validation, caching).
    *   **Access Control:** Configure tool access based on roles, scopes, or explicit rules. `allow-all`/`deny-all` policies.
    *   **Rate Limiting:** Limit the frequency of tool calls for users/roles.
    *   **Argument Validation:** Sanitize and validate tool arguments to prevent dangerous operations.
    *   **Security Events:** Subscribe to events (access denied, rate limit exceeded, dangerous arguments, etc.).
*   **Flexible Configuration:** Set default model, API endpoint, timeouts, proxy, HTTP headers (`Referer`, `X-Title`), fallback models (`modelFallbacks`), response format (`responseFormat`), and more.
*   **Typing:** Fully typed with TypeScript.
*   **Error Handling:** Hierarchy of custom errors (`APIError`, `ValidationError`, `SecurityError`, etc.) for easy handling.
*   **Logging:** Built-in logger with debug mode.
*   **Client Events:** Subscribe to client events (e.g., `'error'`).

## 📦 Installation

```bash
npm install openrouter-client
# or
yarn add openrouter-client
```

## ✨ Basic Usage

```typescript
import OpenRouter from 'openrouter-client'; // Using the default export

// Initialize the client with your API key
const client = new OpenRouter({
  apiKey: 'sk-or-v1-...' // Your OpenRouter API key
  // debug: true, // Enable detailed logging
});

async function main() {
  try {
    // Simple request to the model
    const response = await client.chat({ prompt: 'Hello, world!' });
    console.log('Model response:', response);

    // Example specifying a model
    const haikuResponse = await client.chat({
        model: 'anthropic/claude-3-haiku-20240307',
        prompt: 'Tell me a short joke about programmers.'
    });
    console.log('Joke from Haiku:', haikuResponse);

  } catch (error: any) {
    console.error(`An error occurred [${error.code || 'UNKNOWN'}]: ${error.message}`);
    if (error.details) {
        console.error('Details:', error.details);
    }
  }
  // Note: In short-lived scripts, calling client.destroy() is not strictly necessary, 
  // but it's crucial in long-running applications to release resources (see below).
}

main();
```

## 📚 Core Concepts

### `OpenRouterClient`

The main class for interacting with the API.

**Configuration (`OpenRouterConfig`)**:

When creating an `OpenRouterClient` instance, you pass a configuration object with the following key fields:

*   `apiKey` (string, **required**): Your OpenRouter API key.
*   `model` (string, optional): Default model for requests (default: `anthropic/claude-3-haiku-20240307`).
*   `debug` (boolean, optional): Enable detailed logging (default: `false`).
*   `historyStorage` ('memory' | 'disk', optional): History storage type (default: `memory`).
*   `historyAutoSave` (boolean, optional): Automatically save history on exit for `disk` (default: `false`).
*   `historyTtl` (number, optional): Time-to-live for history entries in ms (default: 24 hours).
*   `historyCleanupInterval` (number, optional): Interval for cleaning up stale history entries in ms (default: 1 hour).
*   `security` (SecurityConfig, optional): Configuration for the security module (see below).
*   `proxy` (string | object, optional): HTTP/HTTPS proxy settings.
*   `apiEndpoint` (string, optional): OpenRouter API URL (default: official endpoint).
*   `referer`, `title` (string, optional): `HTTP-Referer` and `X-Title` headers.
*   `modelFallbacks` (string[], optional): List of fallback models.
*   `responseFormat` (ResponseFormat, optional): Default response format (e.g., `{ type: 'json_object' }`).
*   `strictJsonParsing` (boolean, optional): Strict mode for JSON parsing/validation in responses (default: `false`).
*   `axiosConfig` (AxiosRequestConfig, optional): Additional Axios settings.

**Core Methods**:

*   `chat(options: OpenRouterRequestOptions): Promise<any>`: Sends a request to the model.
    *   `options.prompt` (string): User's query (if not `customMessages`).
    *   `options.user` (string): User ID for history management.
    *   `options.group` (string | null): Group/chat ID for history (optional).
    *   `options.systemPrompt` (string | null): System message.
    *   `options.tools` (Tool[] | null): List of available tools.
    *   `options.responseFormat` (ResponseFormat | null): Response format for this request.
    *   `options.customMessages` (Message[] | null): Full list of messages (instead of prompt/history).
    *   `options.accessToken` (string | null): Access token (if using `SecurityManager`).
    *   ... other API parameters (temperature, maxTokens, topP, etc.).
    *   Returns: `string` (text response), `object` (if JSON requested and parsing/validation succeeded), `null` (if JSON requested, `strictJsonParsing=false`, and parsing/validation failed).
*   `setModel(model: string): void`: Sets the default model.
*   `setApiKey(apiKey: string): void`: Updates the API key.
*   `createAccessToken(userInfo, expiresIn?): string`: Creates a JWT token (requires configured `SecurityManager`).
*   `on(event, handler)`: Subscribe to events (`'error'`, security events).
*   `off(event, handler)`: Unsubscribe from events.
*   `getHistoryManager(): HistoryManager`: Get the history manager instance.
*   `getSecurityManager(): SecurityManager | null`: Get the security manager instance.
*   `destroy(): Promise<void>`: **Releases resources!**
    *   **What it does:** Stops internal timers (`HistoryManager`, `RateLimitManager`), clears in-memory caches (tokens, rate limit counters, history in `memory`), attempts to save history to disk (if `historyStorage='disk'` and `autoSaveOnExit=true`), removes Node.js process event handlers and internal event listeners.
    *   **When to call:** It is **highly recommended** to call this method when the client instance is no longer needed, especially in **long-running applications (servers)** or when **dynamically creating/destroying clients**.
    *   **Why call it:** Prevents memory leaks (due to unclosed timers and undeleted event handlers) and resource leaks, ensures proper shutdown, and guarantees history data persistence.
    *   **When it's less critical (but still good practice):** In very simple, short-lived scripts that execute and terminate immediately (the OS will clean up process resources).

### 📜 History Management (`HistoryManager`)

The library automatically manages conversation history if `user` (and optionally `group`) is provided in `client.chat()` calls.

*   **Storage:** `memory` (default) or `disk` (saves JSON files to a folder, default `./.openrouter-chats`).
*   **History Key:** Generated based on `user` and `group`.
*   **Limit:** Stores the last `maxHistoryEntries` (default: 20) message pairs (user/assistant).
*   **Cleanup:** Automatically removes stale histories (based on `ttl`, default 24 hours) at the `cleanupInterval` (default 1 hour).
*   **Autosave:** The `historyAutoSave: true` option (for `disk`) saves history upon process termination (SIGINT/SIGTERM).

**History Usage Example:**

```typescript
import OpenRouter from 'openrouter-client';

const client = new OpenRouter({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
const userId = 'user-abc';

async function chatWithHistory(prompt: string) {
  console.log(`> User (${userId}): ${prompt}`);
  // Pass 'user' to enable history management
  const response = await client.chat({ prompt, user: userId });
  console.log(`< Assistant: ${response}`);
  return response;
}

async function runConversation() {
  await chatWithHistory('Hello! My name is Alex.');
  await chatWithHistory('What is the weather like in Moscow today?');
  await chatWithHistory('What is my name?'); // The model should remember the name from history
  
  // In applications where the client is used long-term, calling destroy is important
  await client.destroy();
}

runConversation();
```

Access the history manager: `client.getHistoryManager()`.

### 🛠️ Tool Handling (Function Calling)

Models can request to call your functions (tools) to get external information or perform actions.

**1. Define a Tool (`Tool`)**:

Tools are defined as objects matching the `Tool` interface and passed to `client.chat()` via the `tools` option.

```typescript
import { Tool, ToolContext } from 'openrouter-client'; // Import types

// Example weather fetching function
async function getCurrentWeather(location: string, unit: 'celsius' | 'fahrenheit' = 'celsius'): Promise<object> {
    console.log(`[Tool] Fetching weather for ${location} (${unit})`);
    // ... weather API call logic here ...
    // Return an object to be serialized to JSON
    return { location, temperature: "25", unit, forecast: "sunny" };
}

// Tool definition for the API
const weatherTool: Tool = {
  type: 'function',
  function: {
    name: 'getCurrentWeather', // Name the LLM will use
    description: 'Get the current weather in a specified location',
    parameters: { // JSON Schema for arguments
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city or location, e.g., Moscow or San Francisco',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Unit for temperature',
        },
      },
      required: ['location'], // Required arguments
    },
  },
  // Function that will be called by the library
  execute: async (args: { location: string; unit?: 'celsius' | 'fahrenheit' }, context?: ToolContext) => {
      // args - parsed and validated arguments
      // context - contains userInfo and securityManager (if available)
      console.log(`Executing getCurrentWeather for user: ${context?.userInfo?.userId || 'unknown'}`);
      return getCurrentWeather(args.location, args.unit);
  },
  // (Optional) Security settings for this tool
  security: {
      // requiredRole: 'premium_user',
      // rateLimit: { limit: 5, period: 'minute' }
  }
};
```

**2. Using Tools in `chat()`**:

Pass an array of defined tools in the `chat` options. The library will automatically:

1.  Send tool definitions to the model.
2.  If the model decides to call a tool, receive the `tool_calls`.
3.  Parse arguments from the JSON string provided by the model.
4.  Validate arguments against the JSON Schema from the tool definition.
5.  **(If `SecurityManager` is configured)** Perform security checks: access, rate limits, dangerous arguments.
6.  Call your `execute` function with parsed arguments and context.
7.  Send the execution result (or error) back to the model.
8.  Return the final text response from the model after processing tool results.

```typescript
async function askAboutWeather() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' });
  try {
    const response = await client.chat({
      prompt: 'What\'s the weather like in London?',
      tools: [weatherTool] // Pass our tool
    });
    console.log('Final response:', response);
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    // Important for long-running applications
    await client.destroy();
  }
}

askAboutWeather();
```

### 🔒 Security Module (`SecurityManager`)

Provides comprehensive protection when working with tools and user authentication. Activated by passing the `security` configuration when creating the client.

**Components:**

*   `AuthManager`: Manages authentication (currently JWT implementation).
*   `AccessControlManager`: Checks tool access permissions based on roles and policies.
*   `RateLimitManager`: Tracks and enforces tool call frequency limits.
*   `ArgumentSanitizer`: Scans tool arguments for potentially dangerous strings.
*   `SecurityEventEmitter`: Security event bus.

**Configuration (`SecurityConfig`)**:

```typescript
import OpenRouter from 'openrouter-client';
import type { SecurityConfig } from 'openrouter-client/security'; // Import type

const jwtSecret = process.env.JWT_SECRET || 'default-secret-replace-in-production'; // IMPORTANT: Replace with a strong secret!

const securityConfig: SecurityConfig = {
  debug: true, // Enable security logging
  defaultPolicy: 'deny-all', // Deny tool access by default
  requireAuthentication: false, // Require authentication for ANY request with tools?
  allowUnauthenticatedAccess: false, // Allow tool access WITHOUT a token (if requireAuthentication=false)?

  // Authentication settings
  userAuthentication: {
    type: 'jwt',
    jwtSecret: jwtSecret, // Secret for signing and verifying JWTs
  },

  // Tool access settings (override defaultPolicy)
  toolAccess: {
    // Global rules for all tools
    '*': {
      // allow: false // Can deny all by default here too (if defaultPolicy='allow-all')
      // rateLimit: { limit: 100, period: 'hour' } // Global limit
    },
    // Rules for a specific tool
    'getCurrentWeather': {
      allow: true, // Allow calling getCurrentWeather
      roles: ['user', 'admin'], // Only for users with 'user' or 'admin' roles
      rateLimit: { limit: 10, period: 'minute' } // Limit for this specific tool
    },
    'adminTool': {
      allow: true,
      roles: ['admin'], // Only for admins
    },
    'publicTool': {
      allow: true, // Allowed for everyone (even anonymous if allowUnauthenticatedAccess=true)
    }
  },

  // Role definitions (optional, limits and access can be set directly in toolAccess)
  roles: {
      roles: {
          'admin': {
              allowedTools: ['*'], // All tools allowed
              // rateLimits: { '*': { limit: 1000, period: 'hour' }} // Limit for all tools for admin
          },
          'user': {
              allowedTools: ['getCurrentWeather', 'publicTool'], // Explicitly allowed tools
              // rateLimits: { 'getCurrentWeather': { limit: 5, period: 'minute' }}
          }
      }
  },

  // Dangerous argument check configuration
  dangerousArguments: {
    blockedValues: ['DROP TABLE', '--'], // Forbidden substrings
    // toolSpecificPatterns: { // Regex for specific tools
    //   'executeShellCommand': [/rm -rf/, /mkfs/]
    // }
  }
};

const client = new OpenRouter({
  apiKey: 'YOUR_KEY',
  security: securityConfig // Pass the security configuration
});

// --- Usage ---

// 1. Create an access token for a user (e.g., after login)
try {
    const userInfo = { userId: 'user-123', role: 'user', scopes: ['read'] };
    const accessToken = client.createAccessToken(userInfo, '24h'); // Create JWT
    console.log('Access Token:', accessToken);

    // 2. Call chat with the token
    async function callToolWithAuth(token: string) {
        const response = await client.chat({
            prompt: 'What\'s the weather in Berlin?',
            tools: [weatherTool], // Weather tool
            accessToken: token // Pass the token
        });
        console.log('Response with tool:', response);
    }
    // await callToolWithAuth(accessToken);

} catch(e: any) {
    console.error("Error working with token or chat:", e.message);
}

// Subscribe to security events
client.on('access:denied', (event) => {
    console.warn(`[EVENT] Access Denied: User '${event.userId || 'anon'}' to Tool '${event.toolName}'. Reason: ${event.reason}`);
});
client.on('ratelimit:exceeded', (event) => {
     console.warn(`[EVENT] Rate Limit Exceeded: User '${event.userId}' for Tool '${event.toolName}' (Limit: ${event.limit})`);
});

// Don't forget client.destroy() when shutting down the application
// await client.destroy();
```

### ⚙️ Response Format (`responseFormat`)

You can instruct the model to return a response in a specific JSON format.

*   `{ type: 'json_object' }`: The model will return a valid JSON object.
*   `{ type: 'json_schema', json_schema: { name: 'MySchema', schema: { ... } } }`: The model will return JSON conforming to your JSON Schema.

```typescript
async function getStructuredData() {
  const client = new OpenRouter({ apiKey: 'YOUR_KEY' });
  try {
    // Request JSON object
    const jsonResponse = await client.chat({
      prompt: 'Represent information about user John Doe (30 years old, email john.doe@example.com) as JSON.',
      responseFormat: { type: 'json_object' },
      // strictJsonParsing: true, // Throw error if parsing/validation fails
    });
    console.log('JSON Object:', jsonResponse); // Should be a JS object

    // Request JSON according to schema
    const userSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "integer" },
        email: { type: "string", format: "email" }
      },
      required: ["name", "age"]
    };

    const schemaResponse = await client.chat({
        prompt: 'Create JSON for user Jane Smith, 25 years old, jane@test.com',
        responseFormat: {
            type: 'json_schema',
            json_schema: {
                name: 'User',
                schema: userSchema
            }
        }
    });
     console.log('JSON Schema Response:', schemaResponse); // Should be a JS object matching the schema

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    // Again, important for long-running applications
    await client.destroy();
  }
}

getStructuredData();
```

### ⚠️ Error Handling

The library uses custom error classes inheriting from `OpenRouterError`. This allows for easy differentiation between error types:

*   `APIError`: Error from the OpenRouter API (status >= 400).
*   `ValidationError`: Validation error (config, arguments, response, JSON).
*   `NetworkError`: Network error.
*   `AuthenticationError`: Invalid API key (usually 401).
*   `AuthorizationError`: Invalid `accessToken` (JWT) (usually 401).
*   `AccessDeniedError`: Access forbidden (roles/policies) (usually 403).
*   `ToolError`: Error during tool `execute` function (usually 500).
*   `RateLimitError`: Request limit exceeded (usually 429).
*   `TimeoutError`: Request timeout (usually 408).
*   `ConfigError`: Invalid library configuration.
*   `SecurityError`: General security error (dangerous arguments, etc.).

You can catch specific error types or use the `code` field (e.g., `error.code === ErrorCode.RATE_LIMIT_ERROR`).

```typescript
import { RateLimitError, ValidationError, ErrorCode } from 'openrouter-client';

// ...
try {
  // ... call client.chat() ...
} catch (error: any) {
  if (error instanceof RateLimitError) {
    console.warn(`Rate limit reached. Retry after ${Math.ceil((error.details?.timeLeft || 0) / 1000)} sec.`);
  } else if (error instanceof ValidationError) {
    console.error(`Validation error: ${error.message}`, error.details);
  } else if (error.code === ErrorCode.AUTHENTICATION_ERROR) {
     console.error(`Authentication error: check your API key.`);
  } else {
    console.error(`Unhandled error [${error.code || 'UNKNOWN'}]: ${error.message}`);
  }
}
```

You can also subscribe to the client's `'error'` event:

```typescript
client.on('error', (error) => {
  console.error(`[Client Event Error] Code: ${error.code}, Message: ${error.message}`);
});
```

### 🌐 Proxy

Configure a proxy via the `proxy` option in the client configuration:

```typescript
// URL string format
const client1 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: 'http://user:password@your-proxy-server:8080'
});

// Object format
const client2 = new OpenRouter({
  apiKey: 'YOUR_KEY',
  proxy: {
    host: 'your-proxy-server.com',
    port: 8080,
    // user: 'proxy_user', // optional
    // pass: 'proxy_pass'  // optional
  }
});
```

## 📄 License

[MIT](LICENSE)
