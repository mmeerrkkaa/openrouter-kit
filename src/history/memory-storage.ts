import type { IHistoryStorage, Message } from '../types';

export class MemoryHistoryStorage implements IHistoryStorage {
  private storage = new Map<string, Message[]>();

  async load(key: string): Promise<Message[]> {
    const messages = this.storage.get(key);
    return messages ? [...messages] : [];
  }

  async save(key: string, messages: Message[]): Promise<void> {
    this.storage.set(key, [...messages]);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }
}