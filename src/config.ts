// Path: config.ts
/**
 * Default configuration constants for OpenRouter Kit.
 */

/**
 * Default OpenRouter API endpoint URL for chat requests.
 * @see https://openrouter.ai/docs#api-reference
 */
export const API_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Default LLM model identifier, used if not specified in client config or request.
 * Recommended to use a current, fast, and inexpensive model for general tasks.
 * Updated: Using recommended Haiku model as of 2024-03.
 */
export const DEFAULT_MODEL = "anthropic/claude-3-haiku-20240307";
// Previous options:
// export const DEFAULT_MODEL = "google/gemini-flash-1.5"; // Was removed from OpenRouter?
// export const DEFAULT_MODEL = "mistralai/mistral-7b-instruct";
// export const DEFAULT_MODEL = "google/gemini-2.0-flash-001"; // Deprecated?

/**
 * Default HTTP request timeout for OpenRouter API (in milliseconds).
 * Increased to 120 seconds (2 minutes) to handle long LLM requests.
 */
export const DEFAULT_TIMEOUT = 120000; // 120 seconds

/**
 * Maximum number of *pairs* of messages (user + assistant)
 * stored in one chat history by default (`HistoryManager`).
 * Reduced to 20 to save tokens in context and memory/disk space.
 */
export const MAX_HISTORY_ENTRIES = 20; // 20 pairs = 40 messages

/**
 * Default response generation temperature value (from 0.0 to 2.0).
 * Affects randomness/creativity of response. 0.0 is most deterministic.
 */
export const DEFAULT_TEMPERATURE = 0.7;

/**
 * Default folder name for saving history files
 * (used by `HistoryManager` with `storageType='disk'`).
 * Added dot prefix to hide folder in Unix-like systems.
 */
export const DEFAULT_CHATS_FOLDER = "./.openrouter-chats"; // Made name more specific