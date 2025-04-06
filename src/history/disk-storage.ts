import * as fs from 'fs/promises';
import * as path from 'path';
// Use relative path for type import
import type { IHistoryStorage, Message } from '../types';

export class DiskHistoryStorage implements IHistoryStorage {
  private folder: string;

  constructor(folder: string = './.openrouter-chats') {
    this.folder = path.resolve(folder); // Resolve to absolute path for consistency
  }

  private getFilePath(key: string): string {
    // Enhanced sanitization for keys to be safe filenames
    const safeKey = key.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    // Add a prefix/suffix to avoid collisions with potential system files/folders
    return path.join(this.folder, `or_hist_${safeKey}.json`);
  }

  async load(key: string): Promise<Message[]> {
    const filePath = this.getFilePath(key);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const messages = JSON.parse(data);
      // Basic validation
      if (Array.isArray(messages)) {
          // Optional: Deeper validation of message structure here if needed
          return messages;
      }
      console.warn(`[DiskHistoryStorage] Data in ${filePath} is not an array. Returning empty.`);
      return [];
    } catch (err: any) {
      if (err.code === 'ENOENT') {
          // File not found is normal, return empty array
          return [];
      }
      // Log and rethrow other errors (permissions, parse errors)
      console.error(`[DiskHistoryStorage] Error loading history for key '${key}' from ${filePath}:`, err);
      throw err; // Rethrow mapped error? mapError(err) maybe
    }
  }

  async save(key: string, messages: Message[]): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
        // Ensure the directory exists before writing
        await fs.mkdir(this.folder, { recursive: true });
        // Stringify with indentation for readability
        await fs.writeFile(filePath, JSON.stringify(messages, null, 2), 'utf8');
    } catch (err: any) {
        console.error(`[DiskHistoryStorage] Error saving history for key '${key}' to ${filePath}:`, err);
        throw err; // Rethrow mapped error? mapError(err) maybe
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      // Ignore 'file not found' errors, as the goal is deletion
      if (err.code !== 'ENOENT') {
          console.error(`[DiskHistoryStorage] Error deleting history file for key '${key}' at ${filePath}:`, err);
          throw err; // Rethrow other errors (permissions)
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
              // This reverse mapping might be imperfect if original key had chars replaced by '_'
              // Consider storing original key inside the JSON or using a safer mapping if exact key recovery is needed.
              // For now, return the 'safeKey' which might differ from original input key.
              // Or potentially don't reverse map and just use the safeKey internally?
              // Let's assume for now we need to return something resembling the original key.
              // This simplistic reverse mapping is likely WRONG.
              // const originalKeyGuess = safeKey.replace(/_/g, ???); // Hard to reverse safely

              // Option: Store metadata? No, let's just return the safe key for now.
              // The key used in get/save/delete should match what listKeys returns.
               keys.push(safeKey); // Return the safe filename part as the key identifier
          }
      });
      return keys;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
          // Directory not found is normal if no history saved yet
          return [];
      }
      console.error(`[DiskHistoryStorage] Error listing history keys in folder ${this.folder}:`, err);
      throw err; // Rethrow other errors
    }
  }

}