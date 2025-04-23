// Path: src/history/memory-storage.ts
import type { IHistoryStorage, HistoryEntry } from '../types'; // Import HistoryEntry

export class MemoryHistoryStorage implements IHistoryStorage {
  // Store HistoryEntry arrays
  private storage = new Map<string, HistoryEntry[]>();

  async load(key: string): Promise<HistoryEntry[]> {
    const entries = this.storage.get(key);
    return entries ? [...entries] : []; // Return a copy
  }

  async save(key: string, entries: HistoryEntry[]): Promise<void> {
    this.storage.set(key, [...entries]); // Store a copy
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async destroy(): Promise<void> {
      this.storage.clear();
  }
}