// --- API Endpoints and URLs ---
export const API_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_API_BASE_URL = 'https://openrouter.ai/api/v1';
export const API_KEY_INFO_PATH = '/auth/key';
export const CREDITS_API_PATH = '/credits';
export const MODELS_API_PATH = '/models';

// --- Default Model & Parameters ---
export const DEFAULT_MODEL = "google/gemini-2.5-flash";
export const DEFAULT_TIMEOUT = 120000; // 120 seconds
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOOL_CALLS = 10;

// --- History ---
/** @deprecated Max history entries are now managed by the history adapter/manager. */
export const MAX_HISTORY_ENTRIES = 20;
export const DEFAULT_CHATS_FOLDER = "./.openrouter-chats";

// --- Headers ---
export const DEFAULT_REFERER_URL = "https://github.com/mmeerrkkaa/openrouter-kit";
export const DEFAULT_X_TITLE = "openrouter-kit";