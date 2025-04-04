import * as fs from 'fs/promises';
import * as path from 'path';
import type { IHistoryStorage, Message } from '../types';

export class DiskHistoryStorage implements IHistoryStorage {
  private folder: string;

  constructor(folder: string = './.openrouter-chats') {
    this.folder = folder;
  }

  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(this.folder, `chat_${safeKey}.json`);
  }

  async load(key: string): Promise<Message[]> {
    const filePath = this.getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const messages = JSON.parse(data);
      if (Array.isArray(messages)) return messages;
      return [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async save(key: string, messages: Message[]): Promise<void> {
    const filePath = this.getFilePath(key);
    await fs.mkdir(this.folder, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.folder);
      return files
        .filter(f => f.startsWith('chat_') && f.endsWith('.json'))
        .map(f => f.slice(5, -5).replace(/_/g, ''));
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }
}