// Path: history-manager.ts
/**
 * Dialog history manager for OpenRouter Kit.
 * Allows storing history in memory or on disk, automatically truncates it
 * to a specified size and cleans up expired entries by TTL.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { Message, HistoryManagerOptions, HistoryStorageType, ChatHistory } from './types';
import { formatDateTime } from './utils/formatting';
import { DEFAULT_CHATS_FOLDER, MAX_HISTORY_ENTRIES } from './config';
import { Logger } from './utils/logger';
import { ConfigError } from './utils/error'; // Added ConfigError import

// HistoryKey and keyMap deleted

export class HistoryManager {
  // Using standard Map<string, ChatHistory>
  private history: Map<string, ChatHistory>;
  private storageType: HistoryStorageType;
  private chatsFolder: string;
  private maxHistoryEntries: number;
  private ttl: number; // Time-to-live in milliseconds
  private cleanupInterval: number; // Cleanup interval in milliseconds
  private cleanupTimer: NodeJS.Timeout | null;
  private isDestroyed: boolean;
  private autoSaveOnExit: boolean;
  private logger: Logger;

  /**
   * Creates a HistoryManager instance.
   *
   * @param options - History manager configuration options.
   * @param options.storageType - Storage type ('memory' or 'disk'). Default is 'memory'.
   * @param options.chatsFolder - Folder for saving history files (for 'disk'). Default is './.chats'.
   * @param options.maxHistoryEntries - Max number of message pairs (user/assistant). Default from config.ts.
   * @param options.ttl - Time-to-live for history entries (ms). Default is 24 hours.
   * @param options.cleanupInterval - Interval for expired entries cleanup (ms). Default is 1 hour.
   * @param options.autoSaveOnExit - Whether to save history on exit (for 'disk' only). Default is false.
   * @param options.debug - Enable debug mode for logger. Default is false.
   * @throws {ConfigError} If invalid options provided (e.g., negative TTL).
   */
  constructor(options: HistoryManagerOptions = {}) {
    this.logger = new Logger({ debug: options.debug ?? false, prefix: 'HistoryManager' });
    this.logger.log('Initializing HistoryManager...');

    this.history = new Map();
    this.storageType = options.storageType || 'memory';
    this.chatsFolder = options.chatsFolder || DEFAULT_CHATS_FOLDER;
    this.maxHistoryEntries = options.maxHistoryEntries || MAX_HISTORY_ENTRIES;

    // Validating numeric options
    if (this.maxHistoryEntries <= 0) {
        this.logger.warn(`Invalid maxHistoryEntries value (${this.maxHistoryEntries}), using default value ${MAX_HISTORY_ENTRIES}`);
        this.maxHistoryEntries = MAX_HISTORY_ENTRIES;
    }
    this.ttl = options.ttl ?? 24 * 60 * 60 * 1000; // 24 hours by default
    if (this.ttl <= 0) {
        this.logger.warn(`Invalid ttl value (${this.ttl}), using default value of 24 hours.`);
        this.ttl = 24 * 60 * 60 * 1000;
    }
    this.cleanupInterval = options.cleanupInterval ?? 60 * 60 * 1000; // 1 hour by default
    if (this.cleanupInterval <= 0) {
         this.logger.warn(`Invalid cleanupInterval value (${this.cleanupInterval}), using default value of 1 hour.`);
        this.cleanupInterval = 60 * 60 * 1000;
    }

    this.cleanupTimer = null;
    this.isDestroyed = false;
    this.autoSaveOnExit = options.autoSaveOnExit || false;

    this.logger.log(`Parameters: storage=${this.storageType}, folder=${this.chatsFolder}, maxEntries=${this.maxHistoryEntries}, ttl=${this.ttl}ms, cleanupInterval=${this.cleanupInterval}ms, autoSave=${this.autoSaveOnExit}`);
    this.startCleanupTimer();

    // Setting up process handlers
    this._setupProcessHandlers();
  }

  /**
   * Sets up Node.js process termination handlers.
   * @private
   */
  private _setupProcessHandlers(): void {
      if (typeof process !== 'undefined' && typeof process.on === 'function') {
         this.logger.debug('Registering process handlers...');
        // Logging before exit
        process.on('beforeExit', this._handleBeforeExit.bind(this));

        // Handling signals for saving (if needed)
        if (this.autoSaveOnExit && this.storageType === 'disk') {
          process.on('SIGINT', this.gracefulExit.bind(this)); // Ctrl+C
          process.on('SIGTERM', this.gracefulExit.bind(this)); // kill
          // Can add SIGUSR2 for nodemon
          // process.on('SIGUSR2', this.gracefulExit.bind(this));
          this.logger.log('SIGINT/SIGTERM handlers for history saving activated.');
        }
      } else {
          this.logger.debug('Node.js process handlers not registered (not in Node.js environment?).');
      }
  }

  /**
   * Removes Node.js process termination handlers.
   * @private
   */
  private _removeProcessHandlers(): void {
      if (typeof process !== 'undefined' && typeof process.removeListener === 'function') {
          this.logger.debug('Removing process handlers...');
          process.removeListener('beforeExit', this._handleBeforeExit);
          // Remove only if they were added
          if (this.autoSaveOnExit && this.storageType === 'disk') {
              process.removeListener('SIGINT', this.gracefulExit);
              process.removeListener('SIGTERM', this.gracefulExit);
              // process.removeListener('SIGUSR2', this.gracefulExit);
              this.logger.debug('SIGINT/SIGTERM handlers removed.');
          }
      }
  }

  /**
   * Node.js 'beforeExit' event handler.
   * @private
   */
  private async _handleBeforeExit(): Promise<void> {
      // This event is called when event loop is empty. Do not do long async operations here.
      this.logger.debug('Node.js process is exiting (beforeExit event).');
      // If there's something synchronous to do before exiting.
  }

  /**
   * Graceful exit handler for SIGINT/SIGTERM signals to save history
   * if autoSaveOnExit is enabled.
   */
  public async gracefulExit(): Promise<void> {
     if (this.isDestroyed) return;
     this.isDestroyed = true; // Prevent repeated calls
     this.logger.log('SIGINT/SIGTERM signal received. Performing graceful shutdown...');
     this.stopCleanupTimer(); // Stop timer immediately

     try {
       // Save only if autoSaveOnExit and type is disk
       if (this.autoSaveOnExit && this.storageType === 'disk') {
           await this.saveAllHistories();
           this.logger.log('History saved.');
       }
       // Clean up resources (remove handlers)
       this._removeProcessHandlers();
       this.logger.log('HistoryManager resources freed. Exiting...');
       // Give some time for asynchronous logging and other tasks to complete
       await new Promise(resolve => setTimeout(resolve, 100));
       process.exit(0); // Exit with code 0
     } catch (error) {
       this.logger.error('Error during gracefulExit:', error);
       process.exit(1); // Exit with code 1 on error
     }
  }

  /**
   * Saves all histories from memory to disk (if storageType='disk').
   * Used during gracefulExit or can be called manually.
   *
   * @returns {Promise<void>} Promise that resolves when all save attempts are completed.
   */
  public async saveAllHistories(): Promise<void> {
    if (this.storageType !== 'disk' || this.isDestroyed) {
        if (this.storageType !== 'disk') this.logger.debug('Skipping saveAllHistories (storageType != disk)');
        return;
    }
    const historyKeys = Array.from(this.history.keys());
    if (historyKeys.length === 0) {
        this.logger.log('No histories in memory to save.');
        return;
    }

    this.logger.log(`Saving ${historyKeys.length} dialogues to disk...`);
    const promises: Promise<boolean>[] = [];
    for (const key of historyKeys) {
        // Call saveHistory for each history
        promises.push(this.saveHistory(key).catch(err => {
            // Error is already logged inside saveHistory
            this.logger.error(`[saveAllHistories] Failed to save history ${key}.`);
            return false; // Return false on error
        }));
    }
    try {
        const results = await Promise.all(promises);
        const savedCount = results.filter(Boolean).length;
        this.logger.log(`Save completed. Successfully saved ${savedCount} of ${historyKeys.length} dialogues.`);
    } catch (error) {
        // Promise.all should not throw an error, since we use .catch for each promise
        this.logger.error('[saveAllHistories] Unexpected error during waiting for all histories to save:', error);
    }
  }

  /**
   * Starts or restarts periodic expired entries cleanup timer.
   * @private
   */
  private startCleanupTimer(): void {
    this.stopCleanupTimer(); // Stop previous timer if it existed

    if (this.isDestroyed) return; // Do not start if manager is already destroyed

    this.cleanupTimer = setInterval(async () => {
      if (!this.isDestroyed) {
        this.logger.debug('Starting scheduled expired entries cleanup...');
        try {
          await this.cleanup();
        } catch (error) {
           this.logger.error('Error during scheduled cleanup:', error);
        }
      } else {
        // If manager was destroyed, while timer waited, stop it
        this.stopCleanupTimer();
      }
    }, this.cleanupInterval);

    // unref() allows Node.js process to exit even if this timer is active
    if (this.cleanupTimer?.unref) {
      this.cleanupTimer.unref();
      this.logger.debug('Cleanup timer set to unref().');
    }
    this.logger.log(`Cleanup timer started with interval ${this.cleanupInterval / 1000} seconds.`);
  }

  /**
   * Stops periodic cleanup timer.
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.log('Cleanup timer stopped.');
    }
  }

  /**
   * Cleans up expired entries from history in memory and disk (if applicable).
   * Entry is considered expired if time since last access (`lastAccess`)
   * exceeds set `ttl`.
   *
   * @returns {Promise<void>}
   */
  public async cleanup(): Promise<void> {
    if (this.isDestroyed) return;
    const now = Date.now();
    this.logger.debug(`Cleaning up expired entries (TTL: ${this.ttl / 1000} seconds)...`);

    // --- Memory cleanup ---
    const expiredKeysInMemory: string[] = [];
    for (const [key, chatHistory] of this.history.entries()) {
       // Check lastAccess and TTL
       if (chatHistory.lastAccess && (now - chatHistory.lastAccess > this.ttl)) {
           expiredKeysInMemory.push(key);
       }
    }

    if (expiredKeysInMemory.length > 0) {
        for (const key of expiredKeysInMemory) {
          this.history.delete(key);
          this.logger.log(`Expired history removed from memory: ${key}`);
        }
    } else {
        this.logger.debug('No expired entries found in memory.');
    }

    // --- Disk cleanup (if storageType='disk') ---
    if (this.storageType === 'disk') {
        await this._cleanupDiskHistory(now);
    }

    this.logger.debug('Cleanup completed.');
  }

  /**
   * Removes expired history files from disk.
   * @param currentTime - Current time (timestamp ms) for comparison with file modification time.
   * @private
   */
  private async _cleanupDiskHistory(currentTime: number): Promise<void> {
     this.logger.debug(`Cleaning up expired history files in '${this.chatsFolder}'...`);
     let deletedCount = 0;
     try {
       // Check if folder exists
       try { await fsPromises.access(this.chatsFolder, fs.constants.F_OK); }
       catch (err: any) {
           if (err.code === 'ENOENT') {
               this.logger.debug(`History folder '${this.chatsFolder}' not found, disk cleanup skipped.`);
               return;
           }
           throw err; // Other access error
       }

       const files = await fsPromises.readdir(this.chatsFolder);
       const deletePromises: Promise<void>[] = [];

       for (const file of files) {
         // Process only files matching our format and name
         if (!file.startsWith('chat_history_') || !file.endsWith('.json')) continue;

         const filePath = path.join(this.chatsFolder, file);
         try {
           const stats = await fsPromises.stat(filePath);
           // Compare file modification time with TTL
           if (currentTime - stats.mtimeMs > this.ttl) {
             this.logger.debug(`Found expired file: ${file} (Last modified: ${stats.mtime.toISOString()})`);
             // Add delete promise to array
             deletePromises.push(
               fsPromises.unlink(filePath).then(() => {
                   this.logger.log(`Expired history file removed from disk: ${file}`);
                   deletedCount++;
               }).catch(unlinkError => {
                   this.logger.error(`Error removing expired file ${file}:`, unlinkError);
                   // Do not break cleanup from single file removal error
               })
             );
           }
         } catch (statError) {
             this.logger.error(`Error getting information about file ${file}:`, statError);
             // Skip this file
         }
       }

       if (deletePromises.length > 0) {
            await Promise.all(deletePromises); // Wait for all deletions to complete
            this.logger.log(`Disk cleanup completed. Removed ${deletedCount} expired files.`);
       } else {
            this.logger.debug('No expired history files found on disk.');
       }
     } catch (error) {
         this.logger.error(`Error during disk history cleanup:`, error);
     }
  }

  /**
   * Returns current history storage type.
   * @returns {'memory' | 'disk'}
   */
  public getStorageType(): HistoryStorageType { return this.storageType; }

  /**
   * Changes history storage type.
   * WARNING: This does not move existing history between storage types.
   * When switching to 'disk' includes saving handlers if `autoSaveOnExit`=true.
   * When switching from 'disk' excludes these handlers.
   *
   * @param storageType - New storage type ('memory' or 'disk').
   */
  public setStorageType(storageType: HistoryStorageType): void {
     if (storageType !== 'memory' && storageType !== 'disk') {
         this.logger.warn(`Attempt to set invalid storageType: ${storageType}. Ignored.`);
         return;
     }
     if (storageType !== this.storageType) {
        this.logger.log(`History storage type changed from '${this.storageType}' to '${storageType}'.`);
        const oldStorageType = this.storageType;
        this.storageType = storageType;

        // Update process handlers
        // If switched from disk, remove handlers
        if (oldStorageType === 'disk' && this.autoSaveOnExit) {
             this._removeProcessHandlers(); // Remove old (including beforeExit)
             this._setupProcessHandlers(); // Add new (only beforeExit, if not disk)
             this.logger.log('SIGINT/SIGTERM handlers for history saving deactivated.');
        }
        // If switched to disk, add handlers
        if (this.storageType === 'disk' && this.autoSaveOnExit) {
             this._removeProcessHandlers(); // Remove old
             this._setupProcessHandlers(); // Add new (including SIGINT/SIGTERM)
             this.logger.log('SIGINT/SIGTERM handlers for history saving activated.');
        }
     }
  }

  /**
   * Gets history messages for specified key (e.g., 'user:id' or 'group:id_user:id').
   * First looks in memory. If not found and storageType='disk', tries to load from disk.
   * Updates last access (`lastAccess`).
   *
   * @param key - History unique key.
   * @returns {Promise<Message[]>} Array of history messages (copy). Returns empty array if history not found.
   */
  async getHistory(key: string): Promise<Message[]> {
    if (this.isDestroyed) {
        this.logger.warn(`Attempt to get history '${key}' after HistoryManager destruction.`);
        return [];
    }
    this.logger.debug(`Requesting history for key: ${key}`);

    let chatHistory = this.history.get(key);

    if (chatHistory) {
      // Found in memory
      this.logger.debug(`History ${key} found in memory (${chatHistory.messages.length} messages). Updating lastAccess.`);
      chatHistory.lastAccess = Date.now();
      // Return copy of array to avoid external modifications
      return [...chatHistory.messages];
    } else if (this.storageType === 'disk') {
      // Not found in memory, try to load from disk
      this.logger.debug(`History ${key} not found in memory, trying to load from disk...`);
      const loadedMessages = await this._loadHistoryFromDisk(key);
      // If load succeeded, getHistory will return message array
      // _loadHistoryFromDisk already added entry to this.history
      return loadedMessages; // Return load result (may be empty array)
    } else {
      // Not found in memory and type 'memory'
      this.logger.debug(`History ${key} not found (storageType='memory').`);
      return [];
    }
  }

  /**
   * Adds a pair of messages (user and assistant) to history for specified key.
   * If history exceeds `maxHistoryEntries`, old messages are removed.
   * Updates last access (`lastAccess`).
   * If storageType='disk', automatically saves updated history to disk.
   *
   * @param key - History unique key.
   * @param userEntry - User message (`role: 'user'`).
   * @param botEntry - Assistant message (`role: 'assistant'` or `role: 'tool'` in response).
   * @returns {Promise<boolean>} `true` on success, `false` if manager destroyed.
   */
  async addEntry(key: string, userEntry: Message, botEntry: Message): Promise<boolean> {
     if (this.isDestroyed) {
        this.logger.warn(`Attempt to add entry to history '${key}' after HistoryManager destruction.`);
        return false;
     }
     if (!key) {
         this.logger.error('Attempt to add entry to history with empty key.');
         return false;
     }
     if (!userEntry || !botEntry) {
         this.logger.error(`Attempt to add incomplete entry to history '${key}'.`);
         return false;
     }

    this.logger.debug(`Adding entry to history: ${key}`);
    const now = Date.now();

    // Get or create history in memory
    let chatHistory = this.history.get(key);
    if (!chatHistory) {
       this.logger.debug(`Creating new history entry for key: ${key}`);
       chatHistory = { messages: [], lastAccess: now, created: now };
       this.history.set(key, chatHistory);
    }

    // Add timestamp marks if they don't exist
    const userMsgWithTimestamp: Message = { ...userEntry, timestamp: userEntry.timestamp || formatDateTime(new Date(now)) };
    const botMsgWithTimestamp: Message = { ...botEntry, timestamp: botEntry.timestamp || formatDateTime(new Date(now)) };

    // Add messages to array
    chatHistory.messages.push(userMsgWithTimestamp, botMsgWithTimestamp);
    chatHistory.lastAccess = now; // Update access time

    // Trim history if it exceeds limit
    if (chatHistory.messages.length > this.maxHistoryEntries) {
      const removedCount = chatHistory.messages.length - this.maxHistoryEntries;
      // Remove oldest messages (from start of array)
      chatHistory.messages.splice(0, removedCount);
      this.logger.debug(`History ${key} trimmed to ${this.maxHistoryEntries} entries (removed ${removedCount} old messages).`);
    }

    // Save to disk if needed
    if (this.storageType === 'disk') {
        await this.saveHistory(key); // Error logged inside saveHistory
    }

    this.logger.debug(`Entry successfully added to history ${key}. Current size: ${chatHistory.messages.length} messages.`);
    return true;
  }

  /**
   * Saves history for specified key to disk.
   * Works only if storageType='disk'.
   *
   * @param key - History unique key.
   * @returns {Promise<boolean>} `true` on successful save, `false` on error or if storage type not 'disk'.
   */
  async saveHistory(key: string): Promise<boolean> {
    if (this.storageType !== 'disk') {
        this.logger.debug(`Skipping saveHistory for ${key} (storageType='memory').`);
        return false;
    }
    if (this.isDestroyed) {
         this.logger.warn(`Attempt to save history '${key}' after HistoryManager destruction.`);
         return false;
    }

    const chatHistory = this.history.get(key);
    if (!chatHistory) {
      this.logger.warn(`Attempt to save non-existing in memory history: ${key}. Disk load not performed.`);
      return false;
    }

    const sanitizedKey = this._sanitizeKeyForFilename(key);
    const filename = `chat_history_${sanitizedKey}.json`;
    const filePath = path.join(this.chatsFolder, filename);
    this.logger.debug(`Saving history ${key} to file: ${filePath}`);

    try {
      // Ensure folder exists
      try {
          await fsPromises.mkdir(this.chatsFolder, { recursive: true });
      } catch (mkdirError: any) {
          // Ignore error if folder already exists
          if (mkdirError.code !== 'EEXIST') {
              throw mkdirError; // Other folder creation error
          }
      }

      // Serialize only message array
      const dataToSave = JSON.stringify(chatHistory.messages, null, 2); // Format for readability
      await fsPromises.writeFile(filePath, dataToSave, 'utf8');
      this.logger.debug(`History ${key} successfully saved to ${filename}.`);
      return true;
    } catch (err) {
      this.logger.error(`Error saving history ${key} to file ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Loads history for specified key from disk.
   * Works only if storageType='disk'.
   * If file found, history is loaded into memory (`this.history`), updates `lastAccess`
   * and returns message array. If file not found, creates empty entry in memory
   * and returns empty array.
   *
   * @param key - History unique key.
   * @returns {Promise<Message[]>} Loaded message array or empty array.
   * @private
   */
  private async _loadHistoryFromDisk(key: string): Promise<Message[]> {
     if (this.storageType !== 'disk' || this.isDestroyed) {
         return []; // Do not load if type not disk or manager destroyed
     }

     const sanitizedKey = this._sanitizeKeyForFilename(key);
     const filename = `chat_history_${sanitizedKey}.json`;
     const filePath = path.join(this.chatsFolder, filename);
     this.logger.debug(`Attempting to load history ${key} from file: ${filePath}`);

     try {
        // Check file read access
        await fsPromises.access(filePath, fs.constants.R_OK);
        const data = await fsPromises.readFile(filePath, 'utf8');
        const messages = JSON.parse(data) as Message[]; // Assuming file contains Message array

        if (!Array.isArray(messages)) {
            throw new Error('History file does not contain valid JSON array.');
        }

        // Get file creation time for created
        const stats = await fsPromises.stat(filePath);
        const now = Date.now();

        // Trim loaded history to maxHistoryEntries
        const truncatedMessages = messages.slice(-this.maxHistoryEntries);
        if (messages.length > truncatedMessages.length) {
            this.logger.debug(`Loaded history ${key} was trimmed from ${messages.length} to ${truncatedMessages.length} messages.`);
        }

        // Create memory entry
        const chatHistory: ChatHistory = {
            messages: truncatedMessages,
            lastAccess: now, // Set access time as current
            created: stats.birthtimeMs || now // File creation time or current
        };
        this.history.set(key, chatHistory); // Add or update in Map

        this.logger.log(`History ${key} successfully loaded from disk (${truncatedMessages.length} messages).`);
        return chatHistory.messages; // Return loaded (and possibly trimmed) messages

     } catch (err: any) {
         if (err.code === 'ENOENT') {
             // File not found - this is normal if history doesn't exist yet
             this.logger.debug(`History file ${filename} not found. Creating empty memory entry for ${key}.`);
             // Create empty memory entry, so we don't try to load again on next getHistory
             const now = Date.now();
             const newChatHistory: ChatHistory = { messages: [], lastAccess: now, created: now };
             this.history.set(key, newChatHistory);
             return []; // Return empty array
         } else {
             // Other read or parse error
             this.logger.error(`Error loading or parsing history file ${filePath}:`, err);
             // Do not create memory entry on error, so we allow retry on next load
             return []; // Return empty array in case of error
         }
     }
  }

  /**
   * Clears history messages for specified key in memory.
   * If storageType='disk', also saves empty history to disk.
   *
   * @param key - History unique key.
   * @returns {Promise<boolean>} `true` if history found and cleared (or already empty), `false` if manager destroyed.
   */
  async clearHistory(key: string): Promise<boolean> {
    if (this.isDestroyed) {
        this.logger.warn(`Attempt to clear history '${key}' after HistoryManager destruction.`);
        return false;
    }
    this.logger.log(`Clearing history in memory for key: ${key}`);

    let chatHistory = this.history.get(key);

    if (chatHistory) {
      // History found in memory
      if (chatHistory.messages.length > 0) {
          chatHistory.messages = []; // Clear array
          chatHistory.lastAccess = Date.now(); // Update access time
          this.logger.debug(`History ${key} in memory cleared.`);
      } else {
          this.logger.debug(`History ${key} in memory already empty.`);
          chatHistory.lastAccess = Date.now(); // Update access time
      }
      // Save empty history to disk if needed
      if (this.storageType === 'disk') {
          await this.saveHistory(key); // Error logged inside
      }
      return true;
    } else {
      // History not in memory
      this.logger.debug(`History ${key} not found in memory. No clearing needed, but creating empty entry.`);
      // Create empty entry and save it, if needed (for consistency with disk)
       const now = Date.now();
       const newChatHistory: ChatHistory = { messages: [], lastAccess: now, created: now };
       this.history.set(key, newChatHistory);
       if (this.storageType === 'disk') {
           await this.saveHistory(key);
       }
      return true;
    }
  }

  /**
   * Completely removes history for specified key from memory and disk (if applicable).
   *
   * @param key - History unique key.
   * @returns {Promise<boolean>} `true` if deletion (at least from memory or disk) was successful or history not found, `false` in case of file deletion error.
   */
  async deleteHistory(key: string): Promise<boolean> {
     if (this.isDestroyed) {
        this.logger.warn(`Attempt to delete history '${key}' after HistoryManager destruction.`);
        return false;
     }
     this.logger.log(`Deleting history for key: ${key}`);
     let deletedFromMemory = false;
     let deletedFromFile = true; // Assume disk deletion success if type 'memory' or file not found

     // Remove from memory
     if (this.history.has(key)) {
        this.history.delete(key);
        deletedFromMemory = true;
        this.logger.debug(`History ${key} removed from memory.`);
     } else {
        this.logger.debug(`History ${key} not found in memory.`);
     }

     // Remove from disk
     if (this.storageType === 'disk') {
        deletedFromFile = false; 
        const sanitizedKey = this._sanitizeKeyForFilename(key);
        const filename = `chat_history_${sanitizedKey}.json`;
        const filePath = path.join(this.chatsFolder, filename);
        try {
             // Try to delete file
             await fsPromises.unlink(filePath);
             deletedFromFile = true;
             this.logger.log(`History file ${filename} removed from disk.`);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                // File not found - this is also successful "deletion"
                this.logger.debug(`History file ${filename} not found on disk (deletion not needed).`);
                deletedFromFile = true;
            } else {
                // Other deletion error
                this.logger.error(`Error deleting history file ${filePath}:`, err);
                deletedFromFile = false; // Explicitly indicate error
            }
        }
     }

     // Return true if deletion was successful somewhere or history not found
     return deletedFromMemory || deletedFromFile;
  }

  /**
   * Gets list of all history keys.
   * If storageType='memory', returns keys from memory.
   * If storageType='disk', scans `chatsFolder` directory and returns keys,
   * reconstructed from file names.
   *
   * @returns {Promise<string[]>} Array of history keys.
   */
  async getAllHistoryKeys(): Promise<string[]> {
     if (this.isDestroyed) return [];
     this.logger.debug(`Requesting all history keys (storageType='${this.storageType}')...`);
     try {
       if (this.storageType === 'memory') {
         // Simply return keys from Map
         const keys = Array.from(this.history.keys());
         this.logger.debug(`Got ${keys.length} keys from memory.`);
         return keys;
       } else { // storageType === 'disk'
            // Scan directory
           let files: string[];
           try {
               // Ensure folder exists or create it
               await fsPromises.mkdir(this.chatsFolder, { recursive: true });
               files = await fsPromises.readdir(this.chatsFolder);
           } catch (readdirError: any) {
                // If unable to read directory (e.g., no permissions)
                this.logger.error(`Unable to read history directory '${this.chatsFolder}':`, readdirError);
                return []; // Return empty array on error
           }

           const keys = files
             // Filter by file name
             .filter(f => f.startsWith('chat_history_') && f.endsWith('.json'))
             // Extract key from file name
             .map(f => f.substring('chat_history_'.length, f.length - '.json'.length));

           this.logger.debug(`Got ${keys.length} keys by scanning directory '${this.chatsFolder}'.`);
           return keys;
       }
     } catch (err) {
         // General error (though most should be caught above)
         this.logger.error(`Unexpected error during getting history keys:`, err);
         return [];
     }
  }

  /**
   * Sets new TTL for history entries.
   * Does not affect already deleted entries, but will be used on next cleanup.
   *
   * @param ttl - New time-to-live in milliseconds (must be > 0).
   */
  setTTL(ttl: number): void {
     if (typeof ttl === 'number' && ttl > 0) {
        this.logger.log(`History TTL changed to: ${ttl} ms (${(ttl / 1000 / 60 / 60).toFixed(2)} hours)`);
        this.ttl = ttl;
     } else {
        this.logger.warn(`Attempt to set invalid TTL: ${ttl}. Using previous value: ${this.ttl} ms.`);
     }
  }

  /**
   * Returns current TTL for history entries in milliseconds.
   * @returns {number}
   */
  getTTL(): number { return this.ttl; }

  /**
   * Sets new interval for automatic expired entries cleanup.
   * Restarts cleanup timer with new interval.
   *
   * @param interval - New interval in milliseconds (must be > 0).
   */
  setCleanupInterval(interval: number): void {
     if (typeof interval === 'number' && interval > 0) {
        this.logger.log(`History cleanup interval changed to: ${interval} ms (${(interval / 1000 / 60).toFixed(1)} minutes). Restarting timer.`);
        this.cleanupInterval = interval;
        this.startCleanupTimer(); // Restart timer with new interval
     } else {
         this.logger.warn(`Attempt to set invalid cleanup interval: ${interval}. Using previous value: ${this.cleanupInterval} ms.`);
     }
  }

  /**
   * Releases HistoryManager resources: stops cleanup timer,
   * clears history in memory and removes process handlers.
   * If `autoSaveOnExit=true` and `storageType='disk'`, tries to save all history before destruction.
   *
   * @returns {Promise<void>}
   */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) {
        this.logger.debug('HistoryManager already destroyed.');
        return;
    }
    this.logger.log('Destroying HistoryManager...');
    this.isDestroyed = true; 

    // 1. Stop cleanup timer
    this.stopCleanupTimer();

    // 2. Save history if needed
    if (this.autoSaveOnExit && this.storageType === 'disk') {
      this.logger.log('Performing final history save before destruction...');
      try {
          await this.saveAllHistories();
          this.logger.log('Final history save completed.');
      } catch (error) {
          this.logger.error('Error during final history save before destroy:', error);
      }
    }

    // 3. Clear Map in memory
    this.history.clear();
    this.logger.debug('History in memory cleared.');

    // 4. Remove process handlers
    this._removeProcessHandlers();

    this.logger.log('HistoryManager successfully destroyed.');
  }

  /**
   * Converts history key to safe filename, replacing invalid characters.
   * @param key - Original history key.
   * @returns {string} Safe string for use in filename.
   * @private
   */
  private _sanitizeKeyForFilename(key: string): string {
      if (!key) return '_empty_key_';
      // Replace all non-letter, non-digit, non-dash, or non-underscore with '_'
      // Also replace ':' with '__' for better readability (often used as separator)
      return key.replace(/:/g, '__').replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}