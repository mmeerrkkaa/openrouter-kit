// Path: src/history/disk-storage.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IHistoryStorage, HistoryEntry, Message } from '../types'; // Import HistoryEntry

export class DiskHistoryStorage implements IHistoryStorage {
  private folder: string;

  constructor(folder: string = './.openrouter-chats') {
    this.folder = path.resolve(folder);
  }

  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    return path.join(this.folder, `or_hist_${safeKey}.json`);
  }

  async load(key: string): Promise<HistoryEntry[]> {
    const filePath = this.getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data);

      if (!Array.isArray(parsedData)) {
        console.warn(`[DiskHistoryStorage] Data in ${filePath} is not an array. Returning empty.`);
        return [];
      }

      // Basic check for old vs new format
      if (parsedData.length > 0 && parsedData[0].role && parsedData[0].content !== undefined) {
          console.warn(`[DiskHistoryStorage] Data in ${filePath} appears to be in the old Message[] format. Converting to HistoryEntry[] without metadata.`);
          return parsedData.map((msg: Message) => ({ message: msg, apiCallMetadata: null }));
      } else if (parsedData.length === 0 || (parsedData[0].message && parsedData[0].message.role)) {
          return parsedData as HistoryEntry[];
      } else {
           console.warn(`[DiskHistoryStorage] Data in ${filePath} has an unrecognized format. Returning empty.`);
           return [];
      }

    } catch (err: any) {
      if (err.code === 'ENOENT') {
          return [];
      }
      console.error(`[DiskHistoryStorage] Error loading history for key '${key}' from ${filePath}:`, err);
      throw err;
    }
  }

  async save(key: string, entries: HistoryEntry[]): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
        await fs.mkdir(this.folder, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf8');
    } catch (err: any) {
        console.error(`[DiskHistoryStorage] Error saving history for key '${key}' to ${filePath}:`, err);
        throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
          console.error(`[DiskHistoryStorage] Error deleting history file for key '${key}' at ${filePath}:`, err);
          throw err;
      }
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.folder);
      const keys: string[] = [];
      const prefix = 'or_hist_';
      const suffix = '.json';

      files.forEach(f => {
          if (f.startsWith(prefix) && f.endsWith(suffix)) {
              const safeKey = f.slice(prefix.length, -suffix.length);
               keys.push(safeKey);
          }
      });
      return keys;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
          return [];
      }
      console.error(`[DiskHistoryStorage] Error listing history keys in folder ${this.folder}:`, err);
      throw err;
    }
  }
}