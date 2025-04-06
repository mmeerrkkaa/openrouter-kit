// Path: utils/formatting.ts
/**
 * Formatting utilities for the OpenRouter Kit library.
 */

// Use relative path for type import
import { Message } from '../types';
// Use relative path for utility import
import * as jsonUtils from './json-utils';

/**
 * Formats an array of message objects for sending to the OpenRouter/OpenAI API.
 * Ensures only the necessary fields (`role`, `content`, `name`, `tool_call_id`, `tool_calls`)
 * are included and `content` is explicitly `null` if missing (as required by API).
 *
 * @param history - Array of history messages (`Message[]`).
 * @returns A new array containing formatted `Message` objects suitable for the API.
 *          Returns an empty array if the input is not a valid array.
 */
export function formatMessages(history: Message[]): Message[] {
  if (!Array.isArray(history)) {
    // Log warning or return empty? Return empty for robustness.
    console.warn("[formatMessages] Input is not an array. Returning empty array.");
    return [];
  }

  return history.map((entry, index) => {
    // Basic validation for each entry
    if (!entry || typeof entry !== 'object' || !entry.role) {
         console.warn(`[formatMessages] Invalid message entry at index ${index}. Skipping.`, entry);
         // Return null or skip? Let's filter out invalid messages later.
         return null;
    }

    // Start with required fields (role and content, ensuring content is null if missing)
    const formattedMessage: Partial<Message> = {
      role: entry.role,
      content: entry.content ?? null, // API requires null if content is absent/undefined
    };

    // Add optional fields only if they exist and have values
    if (entry.name) {
        formattedMessage.name = entry.name;
    }
    if (entry.tool_call_id) {
        formattedMessage.tool_call_id = entry.tool_call_id;
    }
    // Ensure tool_calls is an array if included
    if (Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0) {
        // Optional: Deeper validation of tool_calls structure can be added here
        formattedMessage.tool_calls = entry.tool_calls;
    }

    // Cast back to Message, assuming basic structure is met
    return formattedMessage as Message;

  }).filter((msg): msg is Message => msg !== null); // Filter out any invalid messages skipped earlier
}

/**
 * Formats a Date object or a timestamp string into an ISO 8601 UTC string.
 * Uses the current time if no valid input is provided.
 *
 * @param timestamp - Optional: A Date object, or a string parsable by `new Date()`.
 * @returns Date and time string in ISO 8601 UTC format (e.g., "2023-10-27T10:30:00.123Z").
 */
export function formatDateTime(timestamp?: string | Date): string {
  let date: Date;

  if (timestamp instanceof Date) {
    // Use the provided Date object directly
    date = timestamp;
  } else if (typeof timestamp === 'string') {
    // Attempt to parse the string
    try {
      date = new Date(timestamp);
      // Check if parsing resulted in a valid date
      if (isNaN(date.getTime())) {
        console.warn(`[formatDateTime] Failed to parse input string as a valid date: "${timestamp}". Using current time.`);
        date = new Date(); // Fallback to current time
      }
    } catch (e) {
      // Catch potential errors during Date parsing (less common)
      console.warn(`[formatDateTime] Error parsing input string as date: "${timestamp}". Using current time.`, e);
      date = new Date(); // Fallback to current time
    }
  } else {
    // If no timestamp (or invalid type) is provided, use the current time
    date = new Date();
  }

  // Return the date formatted as ISO 8601 UTC string
  return date.toISOString();
}

/**
 * @deprecated Functionality is context-dependent and better handled by `_parseAndValidateJsonResponse` in client.ts.
 * Avoid using this function for response parsing.
 */
export function formatResponseByType(responseText: string, type?: string): any {
   console.warn("[formatResponseByType] is deprecated and its logic may be unreliable. Use specific JSON parsing/validation based on 'responseFormat' instead.");
  // Keeping original logic but emphasizing deprecation
  if (typeof responseText !== 'string') return responseText;
  const targetType = type?.toLowerCase() || 'string';
  switch (targetType) {
    case 'string': return responseText;
    case 'boolean':
        const lowerTextBool = responseText.trim().toLowerCase();
        if (lowerTextBool === 'true') return true;
        if (lowerTextBool === 'false') return false;
        try { const parsedBool = JSON.parse(responseText); if (typeof parsedBool === 'boolean') return parsedBool; } catch {}
        throw new Error(`Expected boolean, got: ${responseText}`);
    case 'number': case 'integer':
        const num = Number(responseText.trim());
        if (!isNaN(num)) return num;
        try { const parsedNum = JSON.parse(responseText); if (typeof parsedNum === 'number') return parsedNum; } catch {}
        throw new Error(`Expected number, got: ${responseText}`);
    case 'json': case 'object': case 'array':
        try { return jsonUtils.parseOrThrow(responseText, 'response'); }
        catch (e: any) { throw new Error(`Expected valid JSON (${targetType}), got: ${responseText}. Error: ${e.message}`); }
    default: return responseText;
  }
}

/**
 * Ensures all messages in an array have a `timestamp` field.
 * Adds the current timestamp (in ISO 8601 UTC format) if missing.
 * Modifies the array in place? No, returns a new array.
 *
 * @param messages - Array of messages (`Message[]`) to process.
 * @returns A new array of messages, each guaranteed to have a `timestamp`.
 *          Returns an empty array if the input is not a valid array.
 */
export function addRenderingInfoToMessages(messages: Message[]): Message[] {
   if (!Array.isArray(messages)) {
        console.warn("[addRenderingInfoToMessages] Input is not an array. Returning empty array.");
        return [];
   }

  const now = formatDateTime(); // Get current time once for efficiency

  return messages.map((message) => {
    // Return a new object with timestamp added only if it's missing
    if (!message.timestamp) {
      return {
        ...message, // Copy existing properties
        timestamp: now, // Add the current timestamp
      };
    }
    // If timestamp already exists, return the original message object (or a shallow copy if immutability is strictly needed)
    return message; // Or return { ...message } for shallow copy
  });
}

/**
 * Formats model response content (of any type) into a string suitable for display or logging.
 * Objects and arrays are pretty-printed as JSON strings.
 * Handles primitives, null, and undefined appropriately.
 *
 * @param content - The response content (can be string, object, array, number, boolean, null, undefined).
 * @returns A string representation of the content.
 */
export function formatResponseForDisplay(content: any): string {
  // Handle primitive types directly
  if (typeof content === 'string') {
    return content;
  }
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }
  // Handle null and undefined explicitly
  if (content === null) {
    return "null";
  }
  if (content === undefined) {
    return "undefined";
  }
  // Handle objects and arrays: pretty-print JSON
  if (typeof content === 'object') {
    try {
        // Use safeStringify with indentation (2 spaces) for readability
        // Provide a fallback string in case stringification fails (e.g., circular refs)
        return JSON.stringify(content, null, 2);
    } catch (e) {
        // Fallback if JSON.stringify fails unexpectedly
        return '[Error: Could not stringify object]';
    }
  }
  // Fallback for any other types (e.g., Symbol, BigInt - less common)
  try {
      return String(content);
  } catch {
      return '[Error: Could not convert value to string]';
  }
}