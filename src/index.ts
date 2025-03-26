// Path: index.ts
/**
 * OpenRouter Client Library - Main Export File
 *
 * This library provides a TypeScript/JavaScript client for easy interaction
 * with the OpenRouter API (https://openrouter.ai/), including:
 * - Sending chat requests to various LLMs.
 * - Automatic dialog history management (in memory or on disk).
 * - Processing tool calls (functions) requested by models.
 * - Security module for authentication, access control, rate limiting, and argument validation.
 *
 * @module OpenRouter
 *
 * @example Basic usage:
 * ```typescript
 * import OpenRouter from 'openrouter-client'; // or './index'
 *
 * const client = new OpenRouter({ apiKey: 'YOUR_OPENROUTER_KEY' });
 *
 * async function main() {
 *   const response = await client.chat({ prompt: 'What is the weather in London?' });
 *   console.log(response);
 * }
 * main();
 * ```
 *
 * @example Using with history:
 * ```typescript
 * import OpenRouter from 'openrouter-client';
 *
 * const client = new OpenRouter({ apiKey: 'YOUR_KEY', historyStorage: 'memory' });
 * const userId = 'user-123';
 *
 * async function chat(prompt: string) {
 *   console.log(`User (${userId}): ${prompt}`);
 *   const response = await client.chat({ prompt, user: userId });
 *   console.log(`Assistant: ${response}`);
 * }
 *
 * async function run() {
 *   await chat('My name is Bob.');
 *   await chat('What is my name?');
 * }
 * run();
 * ```
 */ // <-- Make sure this comment is closed properly

// --- Main Classes ---
export { OpenRouterClient } from './client';
export { HistoryManager } from './history-manager';
export { SecurityManager } from './security'; // Export SecurityManager from security module

// --- Full Modules ---
/**
 * Security module. Contains SecurityManager, AuthManager, AccessControlManager, etc.,
 * as well as security-specific types and interfaces.
 * @example
 * import { security } from 'openrouter-client';
 * const customChecker = new security.AccessControlManager(...);
 */
export * as security from './security';

/**
 * Utilities module. Contains error classes, formatting functions, validation,
 * logging, and JSON utilities.
 * @example
 * import { utils } from 'openrouter-client';
 * const logger = new utils.Logger(true);
 * try {
 *   utils.jsonUtils.parseOrThrow('{invalid}');
 * } catch (e) {
 *   if (e instanceof utils.ValidationError) {
 *     logger.error('Validation failed:', e.message);
 *   }
 * }
 */
export * as utils from './utils';

// --- Configuration Constants ---
/**
 * Object containing default configuration constants
 * (API_ENDPOINT, DEFAULT_MODEL, DEFAULT_TIMEOUT, etc.).
 * @example
 * import { config } from 'openrouter-client';
 * console.log(`Default model: ${config.DEFAULT_MODEL}`);
 */
export * as config from './config';

// --- Types and Errors ---
/** Export all main types and interfaces (Message, Tool, OpenRouterConfig, etc.). */
export * from './types';
/**
 * Export all custom error classes (OpenRouterError, APIError, ValidationError, etc.)
 * and the `mapError` function.
 */
export * from './utils/error';

// --- Other Components ---
/**
 * Static `ToolHandler` class for helper operations with tools
 * (e.g., formatting for API). Main processing logic is called within `client.chat`.
 * @example
 * import { ToolHandler } from 'openrouter-client';
 * const apiReadyTool = ToolHandler.formatToolForAPI({ name: 'myTool', ... });
 */
export { ToolHandler } from './tool-handler';

// --- Default Export ---
/**
 * Export main `OpenRouterClient` class as default for convenience.
 * @example
 * import OpenRouter from 'openrouter-client';
 * const client = new OpenRouter({ apiKey: '...' });
 */
import { OpenRouterClient } from './client';
export default OpenRouterClient;