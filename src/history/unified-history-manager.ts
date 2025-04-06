import type { IHistoryStorage, Message } from '../types';
import { Logger } from '../utils/logger';

// Interface for the optional cache entry
interface HistoryEntry {
  messages: Message[];
  lastAccess: number;
  created: number; // Added for potential future use (e.g., LRU with creation time)
}

// Options for the manager
interface UnifiedHistoryManagerOptions {
  ttlMs?: number; // Cache TTL in milliseconds
  cleanupIntervalMs?: number; // How often to clean expired cache entries
  // maxMessages is now typically handled by the storage adapter or specific implementations
  // autoSave is also usually handled by the storage adapter (e.g., DiskHistoryStorage)
}

export class UnifiedHistoryManager {
  private storage: IHistoryStorage;
  // In-memory cache for faster subsequent access
  private cache = new Map<string, HistoryEntry>();
  private ttl: number | null; // Time-to-live for cache entries in milliseconds (null = infinite)
  private cleanupInterval: number | null; // Interval for cache cleanup (null = disabled)
  private cleanupTimer: NodeJS.Timeout | null = null;
  private destroyed = false; // Flag to prevent operations after destruction
  private logger: Logger;

  constructor(
    storageAdapter: IHistoryStorage,
    options: UnifiedHistoryManagerOptions = {},
    logger?: Logger
  ) {
    if (!storageAdapter) {
        throw new Error("UnifiedHistoryManager requires a valid storage adapter.");
    }
    this.logger = logger || new Logger({ prefix: '[UnifiedHistoryManager]' });
    this.storage = storageAdapter;

    // Set TTL and Cleanup Interval, defaulting to positive values or null if disabled/zero
    this.ttl = (options.ttlMs !== undefined && options.ttlMs > 0) ? options.ttlMs : null;
    this.cleanupInterval = (options.cleanupIntervalMs !== undefined && options.cleanupIntervalMs > 0) ? options.cleanupIntervalMs : null;

    // Start cache cleanup only if both interval and TTL are set
    if (this.cleanupInterval && this.ttl) {
        this.startCacheCleanup();
    } else {
      this.logger.log("Cache TTL or cleanup interval not configured, cache cleanup disabled.");
    }
  }

  private startCacheCleanup() {
    // Clear existing timer if any
    if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
    }
    // Set new interval only if parameters are valid
    if (this.cleanupInterval && this.ttl && !this.destroyed) {
        this.cleanupTimer = setInterval(() => this.cleanupExpiredCacheEntries(), this.cleanupInterval);
        // Allow Node.js to exit even if this timer is active
        if (this.cleanupTimer?.unref) {
            this.cleanupTimer.unref();
        }
        this.logger.log(`Cache cleanup timer started (Interval: ${this.cleanupInterval}ms, TTL: ${this.ttl}ms).`);
    }
  }

  private cleanupExpiredCacheEntries() {
    if (this.destroyed || !this.ttl) return; // Don't run if destroyed or TTL disabled

    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Check if entry has expired based on TTL
      if (now - entry.lastAccess > this.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} expired entries from cache.`);
    }
  }

  /**
   * Retrieves history for a key. Checks cache first, then loads from storage adapter.
   * Updates cache access time.
   * @param key - The history key.
   * @returns A Promise resolving to a copy of the messages array.
   */
  async getHistory(key: string): Promise<Message[]> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted getHistory after destroy.");
        return [];
    }
    const now = Date.now();
    const cached = this.cache.get(key);

    // Check cache validity (exists and not expired if TTL is set)
    if (cached && (!this.ttl || now - cached.lastAccess <= this.ttl)) {
      cached.lastAccess = now; // Update access time
      return [...cached.messages]; // Return a copy
    }

    // Not in valid cache, load from storage adapter
    try {
        const messages = await this.storage.load(key);
        // Update cache with loaded messages
        this.cache.set(key, { messages: [...messages], lastAccess: now, created: now });
        return [...messages]; // Return a copy
    } catch (error) {
        this.logger.error(`Error loading history for key '${key}' from storage:`, error);
        // Depending on desired behavior, could re-throw or return empty
        throw error; // Re-throw storage errors by default
    }
  }

  /**
   * Adds new messages to a history key. Loads existing history if not cached,
   * appends new messages, updates cache, and saves back to storage adapter.
   * @param key - The history key.
   * @param newMessages - Array of messages to add.
   * @returns A Promise resolving when operation is complete.
   */
  async addMessages(key: string, newMessages: Message[]): Promise<void> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted addMessages after destroy.");
        return;
    }
    if (!Array.isArray(newMessages) || newMessages.length === 0) {
        return; // Nothing to add
    }

    const now = Date.now();
    let entry = this.cache.get(key);

    // If not in cache or cache expired, load fresh from storage first
    if (!entry || (this.ttl && now - entry.lastAccess > this.ttl)) {
        try {
            const existingMessages = await this.storage.load(key);
            entry = { messages: [...existingMessages], lastAccess: now, created: entry?.created || now }; // Preserve creation time if entry existed but expired
            this.cache.set(key, entry); // Update cache with fresh data
        } catch (error) {
            this.logger.error(`Error loading history for key '${key}' before adding messages:`, error);
            throw error; // Re-throw storage errors
        }
    }

    // Append new messages to the cached (and now current) list
    entry.messages.push(...newMessages);
    entry.lastAccess = now; // Update access time

    // Save the complete, updated list back to storage
    try {
        await this.storage.save(key, entry.messages);
    } catch (error) {
        this.logger.error(`Error saving history for key '${key}' to storage:`, error);
        // If save fails, should we revert cache? For now, no. Cache reflects intended state.
        throw error; // Re-throw storage errors
    }
  }

  /**
   * Clears all messages for a specific history key (sets messages to []).
   * Updates cache and saves empty array to storage adapter.
   * @param key - The history key.
   * @returns A Promise resolving when operation is complete.
   */
  async clearHistory(key: string): Promise<void> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted clearHistory after destroy.");
        return;
    }
    const now = Date.now();
    // Clear in cache
    this.cache.set(key, { messages: [], lastAccess: now, created: now }); // Set/reset cache entry to empty
    // Save empty array to storage
    try {
        await this.storage.save(key, []);
    } catch (error) {
        this.logger.error(`Error clearing history for key '${key}' in storage:`, error);
        throw error;
    }
  }

  /**
   * Deletes a history entry entirely from cache and storage adapter.
   * @param key - The history key.
   * @returns A Promise resolving when operation is complete.
   */
  async deleteHistory(key: string): Promise<void> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted deleteHistory after destroy.");
        return;
    }
    // Delete from cache
    this.cache.delete(key);
    // Delete from storage
    try {
        await this.storage.delete(key);
    } catch (error) {
        this.logger.error(`Error deleting history for key '${key}' from storage:`, error);
        throw error;
    }
  }

  /**
   * Lists all history keys available via the storage adapter.
   * Note: This might be slow depending on the adapter implementation.
   * @returns A Promise resolving to an array of history keys.
   */
  async getAllHistoryKeys(): Promise<string[]> {
    if (this.destroyed) return [];
    try {
        return await this.storage.listKeys();
    } catch (error) {
        this.logger.error(`Error listing keys from storage:`, error);
        throw error;
    }
  }

  /**
   * Cleans up resources: stops cache cleanup timer, clears cache,
   * and calls destroy() on the storage adapter if available.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    // Stop cache cleanup timer
    if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
    }
    // Clear in-memory cache
    this.cache.clear();

    // Destroy the storage adapter if it has a destroy method
    if (this.storage && typeof (this.storage as any).destroy === 'function') {
        try {
            await (this.storage as any).destroy();
        } catch (error) {
            this.logger.error(`Error destroying storage adapter:`, error);
            // Continue cleanup even if adapter destroy fails
        }
    }
    this.logger.log("[UnifiedHistoryManager] Destroyed.");
  }
}