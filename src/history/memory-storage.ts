import type { IHistoryStorage, Message } from '../types';

export class MemoryHistoryStorage implements IHistoryStorage {
  // Use a standard Map for storage
  private storage = new Map<string, Message[]>();

  async load(key: string): Promise<Message[]> {
    const messages = this.storage.get(key);
    // Return a *copy* of the messages array to prevent mutation
    return messages ? [...messages] : [];
  }

  async save(key: string, messages: Message[]): Promise<void> {
    // Store a *copy* of the messages array
    this.storage.set(key, [...messages]);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async listKeys(): Promise<string[]> {
    // Return an array of keys from the Map
    return Array.from(this.storage.keys());
  }

  // Optional: Add a destroy method if needed (e.g., clear interval timers if any)
  // For simple memory storage, clear might be enough.
  async destroy(): Promise<void> {
      this.storage.clear();
      // console.log("[MemoryHistoryStorage] Destroyed (cleared storage).");
  }
}