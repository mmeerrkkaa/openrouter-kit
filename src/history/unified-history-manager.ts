// Path: src/history/unified-history-manager.ts
import type { IHistoryStorage, HistoryEntry, Message } from '../types';
import { Logger } from '../utils/logger';

// Cache now stores HistoryEntry arrays
interface CachedHistoryData {
  entries: HistoryEntry[];
  lastAccess: number;
  created: number;
}

interface UnifiedHistoryManagerOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export class UnifiedHistoryManager {
  private storage: IHistoryStorage;
  private cache = new Map<string, CachedHistoryData>(); // Cache stores CachedHistoryData
  private ttl: number | null;
  private cleanupInterval: number | null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
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

    this.ttl = (options.ttlMs !== undefined && options.ttlMs > 0) ? options.ttlMs : null;
    this.cleanupInterval = (options.cleanupIntervalMs !== undefined && options.cleanupIntervalMs > 0) ? options.cleanupIntervalMs : null;

    if (this.cleanupInterval && this.ttl) {
        this.startCacheCleanup();
    } else {
      this.logger.log("Cache TTL or cleanup interval not configured, cache cleanup disabled.");
    }
  }

  private startCacheCleanup() {
    if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
    }
    if (this.cleanupInterval && this.ttl && !this.destroyed) {
        this.cleanupTimer = setInterval(() => this.cleanupExpiredCacheEntries(), this.cleanupInterval);
        if (this.cleanupTimer?.unref) {
            this.cleanupTimer.unref();
        }
        this.logger.log(`Cache cleanup timer started (Interval: ${this.cleanupInterval}ms, TTL: ${this.ttl}ms).`);
    }
  }

  private cleanupExpiredCacheEntries() {
    if (this.destroyed || !this.ttl) return;
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, cachedData] of this.cache.entries()) {
      if (now - cachedData.lastAccess > this.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} expired entries from cache.`);
    }
  }

  /** Retrieves history entries for a key. */
  public async getHistoryEntries(key: string): Promise<HistoryEntry[]> { // Public method
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted getHistoryEntries after destroy.");
        return [];
    }
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && (!this.ttl || now - cached.lastAccess <= this.ttl)) {
      cached.lastAccess = now;
      return [...cached.entries]; // Return copy from cache
    }

    try {
        const entries = await this.storage.load(key); // Load HistoryEntry[]
        this.cache.set(key, { entries: [...entries], lastAccess: now, created: now });
        return [...entries]; // Return copy
    } catch (error) {
        this.logger.error(`Error loading history entries for key '${key}' from storage:`, error);
        throw error;
    }
  }

   /** Retrieves only the messages from the history for a key. */
   public async getHistoryMessages(key: string): Promise<Message[]> {
       const entries = await this.getHistoryEntries(key);
       return entries.map(entry => entry.message);
   }

  /** Adds new history entries to a history key. */
  public async addHistoryEntries(key: string, newEntries: HistoryEntry[]): Promise<void> { // Public method
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted addHistoryEntries after destroy.");
        return;
    }
    if (!Array.isArray(newEntries) || newEntries.length === 0) {
        return;
    }

    const now = Date.now();
    let cachedData = this.cache.get(key);

    // Load existing entries if not cached or expired
    let currentEntries: HistoryEntry[] = [];
    if (!cachedData || (this.ttl && now - cachedData.lastAccess > this.ttl)) {
        try {
            currentEntries = await this.storage.load(key);
            // Update cache with fresh data
            cachedData = { entries: [...currentEntries], lastAccess: now, created: cachedData?.created || now };
            this.cache.set(key, cachedData);
        } catch (error) {
            this.logger.error(`Error loading history entries for key '${key}' before adding new entries:`, error);
            throw error;
        }
    } else {
        currentEntries = cachedData.entries; // Use cached entries
    }

    // Append new entries
    const updatedEntries = [...currentEntries, ...newEntries];

    // Update cache
    this.cache.set(key, { entries: [...updatedEntries], lastAccess: now, created: cachedData?.created || now });

    // Save back to storage
    try {
        await this.storage.save(key, updatedEntries);
    } catch (error) {
        this.logger.error(`Error saving history entries for key '${key}' to storage:`, error);
        // Consider reverting cache on save failure? For now, no.
        throw error;
    }
  }

  /** Clears all history entries for a specific history key. */
  public async clearHistory(key: string): Promise<void> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted clearHistory after destroy.");
        return;
    }
    const now = Date.now();
    this.cache.set(key, { entries: [], lastAccess: now, created: now });
    try {
        await this.storage.save(key, []); // Save empty array
    } catch (error) {
        this.logger.error(`Error clearing history for key '${key}' in storage:`, error);
        throw error;
    }
  }

  /** Deletes a history entry entirely from cache and storage adapter. */
  public async deleteHistory(key: string): Promise<void> {
    if (this.destroyed) {
        this.logger.warn("[UnifiedHistoryManager] Attempted deleteHistory after destroy.");
        return;
    }
    this.cache.delete(key);
    try {
        await this.storage.delete(key);
    } catch (error) {
        this.logger.error(`Error deleting history for key '${key}' from storage:`, error);
        throw error;
    }
  }

  /** Lists all history keys available via the storage adapter. */
  public async getAllHistoryKeys(): Promise<string[]> {
    if (this.destroyed) return [];
    try {
        return await this.storage.listKeys();
    } catch (error) {
        this.logger.error(`Error listing keys from storage:`, error);
        throw error;
    }
  }

  /** Cleans up resources. */
  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
    }
    this.cache.clear();

    if (this.storage && typeof (this.storage as any).destroy === 'function') {
        try {
            await (this.storage as any).destroy();
        } catch (error) {
            this.logger.error(`Error destroying storage adapter:`, error);
        }
    }
    this.logger.log("[UnifiedHistoryManager] Destroyed.");
  }
}