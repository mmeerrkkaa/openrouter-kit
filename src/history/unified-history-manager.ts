import type { IHistoryStorage, Message } from '../types';

interface HistoryEntry {
  messages: Message[];
  lastAccess: number;
  created: number;
}

interface UnifiedHistoryManagerOptions {
  ttlMs?: number;
  cleanupIntervalMs?: number;
  autoSave?: boolean;
}

export class UnifiedHistoryManager {
  private storage: IHistoryStorage;
  private cache = new Map<string, HistoryEntry>();
  private ttl: number;
  private cleanupInterval: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private destroyed = false;

  constructor(storage: IHistoryStorage, options: UnifiedHistoryManagerOptions = {}) {
    this.storage = storage;
    this.ttl = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.cleanupInterval = options.cleanupIntervalMs ?? 60 * 60 * 1000;
    this.startCleanup();
  }

  private startCleanup() {
    this.cleanupTimer?.unref();
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), this.cleanupInterval);
    this.cleanupTimer.unref();
  }

  private async cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastAccess > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  async getHistory(key: string): Promise<Message[]> {
    if (this.destroyed) return [];
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now - cached.lastAccess <= this.ttl) {
      cached.lastAccess = now;
      return [...cached.messages];
    }
    const messages = await this.storage.load(key);
    this.cache.set(key, { messages: [...messages], lastAccess: now, created: now });
    return [...messages];
  }

  async addMessages(key: string, newMessages: Message[]): Promise<void> {
    if (this.destroyed) return;
    const now = Date.now();
    let entry = this.cache.get(key);
    if (!entry) {
      const existing = await this.storage.load(key);
      entry = { messages: existing, lastAccess: now, created: now };
      this.cache.set(key, entry);
    }
    entry.messages.push(...newMessages);
    entry.lastAccess = now;
    await this.storage.save(key, entry.messages);
  }

  async clearHistory(key: string): Promise<void> {
    this.cache.delete(key);
    await this.storage.save(key, []);
  }

  async deleteHistory(key: string): Promise<void> {
    this.cache.delete(key);
    await this.storage.delete(key);
  }

  async getAllHistoryKeys(): Promise<string[]> {
    return this.storage.listKeys();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cache.clear();
  }
}