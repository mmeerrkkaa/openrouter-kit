// Path: utils/formatting.ts
/**
 * Formatting utilities for the OpenRouter Kit library.
 */

import { Message } from '../types';
import * as jsonUtils from './json-utils'; // Used for safe serialization

/**
 * Formats message history for sending to OpenRouter/OpenAI API.
 * Keeps only the necessary fields (`role`, `content`, `name`, `tool_call_id`, `tool_calls`).
 *
 * @param history - Array of history messages (`Message[]`).
 * @returns Formatted `Message[]` array, ready to send to API.
 *          Returns empty array if input array is empty or invalid.
 */
export function formatMessages(history: Message[]): Message[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  return history.map(entry => {
    // Basic fields
    const formattedMessage: Partial<Message> = {
      role: entry.role,
      content: entry.content, // content can be null
    };

    // Optional fields
    if (entry.name) formattedMessage.name = entry.name;
    if (entry.tool_call_id) formattedMessage.tool_call_id = entry.tool_call_id;
    if (entry.tool_calls && entry.tool_calls.length > 0) {
        // Validate tool_calls format? For now, just copy.
        formattedMessage.tool_calls = entry.tool_calls;
    }

    // Return as Message, since role and content are always present
    return formattedMessage as Message;
  });
}

/**
 * Formats date and time to ISO 8601 UTC string.
 * If no input provided, uses current time.
 *
 * @param timestamp - Timestamp (Date object, ISO string, or `undefined`).
 * @returns Date and time string in ISO 8601 UTC format (e.g., "2023-10-27T10:30:00.000Z").
 */
export function formatDateTime(timestamp?: string | Date): string {
  let date: Date;

  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string') {
    try {
      date = new Date(timestamp);
      // Check if parsing succeeded
      if (isNaN(date.getTime())) {
        console.warn(`[formatDateTime] Failed to parse string as date: "${timestamp}". Using current time.`);
        date = new Date();
      }
    } catch (e) {
      console.warn(`[formatDateTime] Error parsing string as date: "${timestamp}". Using current time.`, e);
      date = new Date();
    }
  } else {
    date = new Date(); // Current time if timestamp not provided
  }

  // Return in ISO 8601 UTC format
  return date.toISOString();
}

/**
 * @deprecated Function not used and its logic may be incorrect.
 *             Parsing and type checking of response should be done based on `responseFormat`.
 * Formats response text depending on expected type.
 * @param responseText - Response text from LLM.
 * @param type - Expected type ('string', 'boolean', 'number', 'json', 'object').
 * @returns Formatted value.
 * @throws {Error} If unable to convert to specified type.
 */
export function formatResponseByType(responseText: string, type?: string): any {
   console.warn("[formatResponseByType] is deprecated and should not be used.");
  if (typeof responseText !== 'string') return responseText; // If already not string

  const targetType = type?.toLowerCase() || 'string';

  switch (targetType) {
    case 'string':
      return responseText;
    case 'boolean':
      const lowerTextBool = responseText.trim().toLowerCase();
      if (lowerTextBool === 'true') return true;
      if (lowerTextBool === 'false') return false;
      // Try parsing as JSON boolean
      try { const parsedBool = JSON.parse(responseText); if (typeof parsedBool === 'boolean') return parsedBool; } catch {}
      throw new Error(`Expected boolean, got: ${responseText}`);
    case 'number':
    case 'integer':
      const num = Number(responseText.trim());
      if (!isNaN(num)) return num;
      // Try parsing as JSON number
       try { const parsedNum = JSON.parse(responseText); if (typeof parsedNum === 'number') return parsedNum; } catch {}
      throw new Error(`Expected number, got: ${responseText}`);
    case 'json':
    case 'object':
    case 'array':
      try {
        return jsonUtils.parseOrThrow(responseText, 'response');
      } catch (e: any) {
        throw new Error(`Expected valid JSON (${targetType}), got: ${responseText}. Error: ${e.message}`);
      }
    default:
      console.warn(`[formatResponseByType] Unknown type '${type}', returning string.`);
      return responseText;
  }
}

/**
 * Adds `timestamp` field to messages if it's missing.
 * Uses current time.
 *
 * @param messages - Array of messages to process.
 * @returns New array of messages with added timestamp fields.
 */
export function addRenderingInfoToMessages(messages: Message[]): Message[] {
   if (!Array.isArray(messages)) return [];
  const now = formatDateTime(); // Get current time once
  return messages.map((message) => {
    // Add timestamp only if it's missing
    if (!message.timestamp) {
      return {
        ...message,
        timestamp: now,
      };
    }
    // If timestamp already exists, return message unchanged
    return message;
  });
}

/**
 * Formats model response (any type) to string for display to user or logging.
 * Objects and arrays are converted to JSON string with indentation.
 *
 * @param content - Model response (can be string, object, null, etc.).
 * @returns Formatted response as string.
 */
export function formatResponseForDisplay(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return String(content); // "null" or "undefined"
  }
  if (typeof content === 'object') {
    // Use safe serialization with indentation
    return jsonUtils.safeStringify(content, '[Serialization failed]', { logger: undefined /* don't log errors here */ });
  }
  // For other primitives (number, boolean)
  return String(content);
}