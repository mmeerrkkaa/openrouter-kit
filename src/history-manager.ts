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
import { ConfigError } from './utils/error';

// Default TTL and Cleanup Interval constants
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class HistoryManager {
  // Using standard Map<string, ChatHistory>
  private history: Map<string, ChatHistory>;
  private storageType: HistoryStorageType;
  private chatsFolder: string;
  private maxHistoryEntries: number; // Max number of *messages* (not pairs)
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
   */
  constructor(options: HistoryManagerOptions = {}) {
    // Use provided logger or create a default one
    this.logger = options.logger || new Logger({ debug: options.debug ?? false, prefix: 'HistoryManager' });
    this.logger.log('Initializing HistoryManager...');

    this.history = new Map();
    this.storageType = options.storageType || 'memory';
    // Use chatsFolder only if storageType is 'disk'
    this.chatsFolder = options.storageType === 'disk' ? (options.chatsFolder || DEFAULT_CHATS_FOLDER) : '';
    // Max history entries now refers to *total messages*
    this.maxHistoryEntries = options.maxHistoryEntries || (MAX_HISTORY_ENTRIES * 2); // Default based on pairs

    // Validating numeric options
    if (this.maxHistoryEntries <= 0) {
        this.logger.warn(`Invalid maxHistoryEntries value (${this.maxHistoryEntries}), must be positive. Using default: ${MAX_HISTORY_ENTRIES * 2}`);
        this.maxHistoryEntries = MAX_HISTORY_ENTRIES * 2;
    }
    this.ttl = options.ttl ?? DEFAULT_TTL_MS;
    if (this.ttl <= 0) {
        this.logger.warn(`Invalid ttl value (${this.ttl}), must be positive. Using default: ${DEFAULT_TTL_MS}ms.`);
        this.ttl = DEFAULT_TTL_MS;
    }
    this.cleanupInterval = options.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL_MS;
    if (this.cleanupInterval <= 0) {
         this.logger.warn(`Invalid cleanupInterval value (${this.cleanupInterval}), must be positive. Using default: ${DEFAULT_CLEANUP_INTERVAL_MS}ms.`);
        this.cleanupInterval = DEFAULT_CLEANUP_INTERVAL_MS;
    }

    this.cleanupTimer = null;
    this.isDestroyed = false;
    // Only enable autoSave if storage is disk
    this.autoSaveOnExit = (options.autoSaveOnExit ?? false) && this.storageType === 'disk';

    this.logger.log(`Parameters: storage=${this.storageType}, folder=${this.chatsFolder || 'N/A'}, maxMessages=${this.maxHistoryEntries}, ttl=${this.ttl}ms, cleanupInterval=${this.cleanupInterval}ms, autoSave=${this.autoSaveOnExit}`);
    this.startCleanupTimer();

    // Setting up process handlers only if autoSave is enabled
    if (this.autoSaveOnExit) {
       this._setupProcessHandlers();
    }
  }

  /**
   * Sets up Node.js process termination handlers for auto-saving.
   * @private
   */
  private _setupProcessHandlers(): void {
      // Ensure we are in Node.js and autoSave is enabled
      if (this.autoSaveOnExit && typeof process !== 'undefined' && typeof process.on === 'function') {
         this.logger.debug('Registering process exit handlers for auto-save...');
        process.on('SIGINT', this.gracefulExit.bind(this)); // Ctrl+C
        process.on('SIGTERM', this.gracefulExit.bind(this)); // kill
        this.logger.log('SIGINT/SIGTERM handlers for history saving activated.');
      } else if (this.autoSaveOnExit) {
          this.logger.warn('Auto-save enabled, but process handlers not registered (not in Node.js environment or autoSaveOnExit is false?).');
      }
  }

  /**
   * Removes Node.js process termination handlers.
   * @private
   */
  private _removeProcessHandlers(): void {
      if (this.autoSaveOnExit && typeof process !== 'undefined' && typeof process.removeListener === 'function') {
          this.logger.debug('Removing process exit handlers...');
          process.removeListener('SIGINT', this.gracefulExit);
          process.removeListener('SIGTERM', this.gracefulExit);
          // process.removeListener('beforeExit', ...); // If added
          this.logger.debug('Process exit handlers removed.');
      }
  }

  /**
   * Graceful exit handler for SIGINT/SIGTERM signals to save history.
   * @param signal - The signal received (optional).
   */
  public async gracefulExit(signal?: string): Promise<void> {
     if (this.isDestroyed) return; // Already destroyed or exiting
     this.isDestroyed = true; // Prevent repeated calls during exit sequence
     this.logger.log(`Signal ${signal || 'unknown'} received. Performing graceful shutdown...`);
     this.stopCleanupTimer(); // Stop timer immediately

     try {
       // Save only if autoSaveOnExit and type is disk (double check)
       if (this.autoSaveOnExit && this.storageType === 'disk') {
           await this.saveAllHistories();
       } else {
           this.logger.debug('Skipping history save on exit (autoSave disabled or storage type is not disk).');
       }
       // Clean up resources (remove handlers)
       this._removeProcessHandlers();
       this.logger.log('HistoryManager resources freed. Exiting process...');
       // Give logs a moment to flush
       await new Promise(resolve => setTimeout(resolve, 150));
       // Exit - use signal code if possible, otherwise 0
       const exitCode = (signal === 'SIGINT' || signal === 'SIGTERM') ? 0 : 1; // Default to 1 if unknown signal caused exit
       process.exit(exitCode);
     } catch (error) {
       this.logger.error('Error during gracefulExit:', error);
       process.exit(1); // Exit with error code
     }
  }

  /**
   * Saves all histories currently in memory to disk (if storageType='disk').
   * Used during gracefulExit or can be called manually.
   *
   * @returns {Promise<void>} Promise that resolves when all save attempts are completed.
   */
  public async saveAllHistories(): Promise<void> {
    if (this.storageType !== 'disk') {
        this.logger.debug('Skipping saveAllHistories (storageType != disk)');
        return;
    }
    if (this.isDestroyed) {
        this.logger.warn('Attempt to saveAllHistories after manager destruction.');
        return;
    }

    const historyKeys = Array.from(this.history.keys());
    if (historyKeys.length === 0) {
        this.logger.log('No histories in memory to save.');
        return;
    }

    this.logger.log(`Saving ${historyKeys.length} dialogue(s) to disk...`);
    // Use Promise.allSettled to wait for all saves, even if some fail
    const results = await Promise.allSettled(
        historyKeys.map(key => this.saveHistory(key))
    );

    let savedCount = 0;
    let failedCount = 0;
    results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value === true) {
            savedCount++;
        } else if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value === false)) {
            failedCount++;
            const key = historyKeys[index];
            const reason = result.status === 'rejected' ? result.reason : 'saveHistory returned false';
            // Error is already logged inside saveHistory, just summarize here
            this.logger.error(`[saveAllHistories] Failed to save history for key: ${key}. Reason: ${reason}`);
        }
    });

    this.logger.log(`Save completed. Successfully saved ${savedCount} of ${historyKeys.length} dialogue(s). ${failedCount > 0 ? `${failedCount} failed.` : ''}`);
  }

  /** Starts or restarts periodic expired entries cleanup timer. */
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
        // If manager was destroyed while timer was waiting, stop it
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

  /** Stops periodic cleanup timer. */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.log('Cleanup timer stopped.');
    }
  }

  /** Cleans up expired entries from memory and disk (if applicable). */
  public async cleanup(): Promise<void> {
    if (this.isDestroyed) return;
    const now = Date.now();
    this.logger.debug(`Cleaning up expired entries (TTL: ${this.ttl / 1000} seconds)...`);
    let memoryCleanedCount = 0;

    // --- Memory cleanup ---
    for (const [key, chatHistory] of this.history.entries()) {
       if (chatHistory.lastAccess && (now - chatHistory.lastAccess > this.ttl)) {
           this.history.delete(key);
           memoryCleanedCount++;
           this.logger.log(`Expired history removed from memory: ${key}`);
       }
    }
    if (memoryCleanedCount > 0) {
        this.logger.log(`Removed ${memoryCleanedCount} expired entries from memory.`);
    } else {
        this.logger.debug('No expired entries found in memory.');
    }

    // --- Disk cleanup (if storageType='disk') ---
    if (this.storageType === 'disk') {
        await this._cleanupDiskHistory(now);
    }

    this.logger.debug('Cleanup cycle completed.');
  }

  /** Removes expired history files from disk. */
  private async _cleanupDiskHistory(currentTime: number): Promise<void> {
     this.logger.debug(`Cleaning up expired history files in '${this.chatsFolder}'...`);
     let deletedCount = 0;
     try {
       // Check if folder exists first to avoid error
       try { await fsPromises.access(this.chatsFolder, fs.constants.F_OK); }
       catch (err: any) {
           if (err.code === 'ENOENT') {
               this.logger.debug(`History folder '${this.chatsFolder}' not found, disk cleanup skipped.`);
               return; // Folder doesn't exist, nothing to clean
           }
           throw err; // Rethrow other access errors (e.g., permissions)
       }

       const files = await fsPromises.readdir(this.chatsFolder);
       const deletePromises: Promise<void>[] = [];

       for (const file of files) {
         // Process only files matching our naming convention
         const key = this._getKeyFromFilename(file);
         if (!key) continue; // Skip files not matching the pattern

         const filePath = path.join(this.chatsFolder, file);
         try {
           const stats = await fsPromises.stat(filePath);
           // Compare file modification time with TTL for expiration
           if (currentTime - stats.mtimeMs > this.ttl) {
             this.logger.debug(`Found expired file: ${file} (Last modified: ${stats.mtime.toISOString()})`);
             // Add delete promise to array for parallel deletion
             deletePromises.push(
               fsPromises.unlink(filePath).then(() => {
                   this.logger.log(`Expired history file removed from disk: ${file}`);
                   deletedCount++;
               }).catch(unlinkError => {
                   this.logger.error(`Error removing expired file ${file}:`, unlinkError);
                   // Don't let one failed deletion stop the whole cleanup
               })
             );
           }
         } catch (statError: any) {
            // Handle cases where file disappears between readdir and stat, or permission issues
            if (statError.code !== 'ENOENT') {
                 this.logger.error(`Error getting information about file ${file}:`, statError);
             } // Ignore ENOENT silently
         }
       }

       // Wait for all deletions to complete (or fail)
       if (deletePromises.length > 0) {
            await Promise.allSettled(deletePromises); // Use allSettled to ensure all attempts finish
            this.logger.log(`Disk cleanup attempt finished. Removed ${deletedCount} expired file(s).`);
       } else {
            this.logger.debug('No expired history files found on disk during cleanup.');
       }
     } catch (error) {
         // Catch errors from readdir or initial access check
         this.logger.error(`Error during disk history cleanup process:`, error);
     }
  }

  /** Returns current history storage type. */
  public getStorageType(): HistoryStorageType { return this.storageType; }

  /** Changes history storage type. WARNING: Does not move existing history. */
  public setStorageType(storageType: HistoryStorageType): void {
     if (storageType !== 'memory' && storageType !== 'disk') {
         this.logger.warn(`Attempt to set invalid storageType: ${storageType}. Ignored.`);
         return;
     }
     if (storageType !== this.storageType) {
        this.logger.log(`History storage type changed from '${this.storageType}' to '${storageType}'.`);
        const oldStorageType = this.storageType;
        this.storageType = storageType;

        // Update chatsFolder path if switching to disk
        if (this.storageType === 'disk' && !this.chatsFolder) {
             this.chatsFolder = DEFAULT_CHATS_FOLDER; // Assign default if switching to disk and folder wasn't set
             this.logger.log(`Using default chats folder: ${this.chatsFolder}`);
        }

        // Update process handlers based on new type and autoSave setting
        const shouldHaveHandlers = this.autoSaveOnExit && this.storageType === 'disk';
        const hadHandlers = this.autoSaveOnExit && oldStorageType === 'disk';

        if (shouldHaveHandlers && !hadHandlers) {
            this._setupProcessHandlers(); // Add handlers
        } else if (!shouldHaveHandlers && hadHandlers) {
            this._removeProcessHandlers(); // Remove handlers
        }
     }
  }

  /**
   * Gets history messages for a specific key. Loads from disk if necessary and enabled.
   * Returns a copy of the messages.
   */
  async getHistory(key: string): Promise<Message[]> {
    if (this.isDestroyed) {
        this.logger.warn(`Attempt to get history '${key}' after HistoryManager destruction.`);
        return [];
    }
    if (!key || typeof key !== 'string') {
        this.logger.error('getHistory called with invalid key.');
        return [];
    }
    this.logger.debug(`Requesting history for key: ${key}`);

    let chatHistory = this.history.get(key);

    if (chatHistory) {
      // Found in memory
      this.logger.debug(`History ${key} found in memory (${chatHistory.messages.length} messages). Updating lastAccess.`);
      chatHistory.lastAccess = Date.now();
      // Return a copy to prevent external modification
      return [...chatHistory.messages];
    } else if (this.storageType === 'disk') {
      // Not in memory, try loading from disk
      this.logger.debug(`History ${key} not found in memory, trying to load from disk...`);
      // _loadHistoryFromDisk handles adding to memory cache if successful
      const loadedMessages = await this._loadHistoryFromDisk(key);
      return loadedMessages; // Returns messages array (possibly empty)
    } else {
      // Not found in memory and storage is 'memory'
      this.logger.debug(`History ${key} not found (storageType='memory').`);
      return []; // Return empty array
    }
  }

  /**
   * Adds a pair of messages (user and assistant) to the history for the specified key.
   * Ensures history does not exceed `maxHistoryEntries`. Updates access time.
   * Saves to disk automatically if storageType='disk'.
   *
   * @param key - The unique key for the history.
   * @param userEntry - The user's message object.
   * @param botEntry - The assistant's message object.
   * @returns {Promise<boolean>} `true` on success, `false` if manager destroyed or invalid input.
   */
  async addEntry(key: string, userEntry: Message, botEntry: Message): Promise<boolean> {
     if (!userEntry || userEntry.role !== 'user' || !botEntry || botEntry.role !== 'assistant') {
         this.logger.error(`Invalid input for addEntry: requires a user message and an assistant message. Key: ${key}`);
         return false;
     }
     // Delegate to the more general addMessages method
     return this.addMessages(key, [userEntry, botEntry]);
  }

  /**
   * Adds an array of messages to the history for the specified key.
   * Useful for adding sequences like tool results + final assistant response.
   * Ensures history does not exceed `maxHistoryEntries`. Updates access time.
   * Saves to disk automatically if storageType='disk'.
   *
   * @param key - The unique key for the history.
   * @param newMessages - An array of message objects to add.
   * @returns {Promise<boolean>} `true` on success, `false` if manager destroyed or invalid input.
   */
  async addMessages(key: string, newMessages: Message[]): Promise<boolean> {
      if (this.isDestroyed) {
          this.logger.warn(`Attempt to add messages to history '${key}' after HistoryManager destruction.`);
          return false;
      }
      if (!key || typeof key !== 'string') {
          this.logger.error('addMessages called with invalid key.');
          return false;
      }
      if (!Array.isArray(newMessages) || newMessages.length === 0) {
          this.logger.warn(`addMessages called for key '${key}' with no messages to add.`);
          return true; // Nothing to add is considered success
      }
      // Basic validation of message structure
       if (!newMessages.every(m => m && typeof m.role === 'string')) {
           this.logger.error(`Invalid message format in addMessages for key '${key}'. Each message must have a 'role'.`);
           return false;
       }

      this.logger.debug(`Adding ${newMessages.length} message(s) to history: ${key}`);
      const now = Date.now();

      // Get or create history entry in memory
      let chatHistory = this.history.get(key);
      if (!chatHistory) {
         this.logger.debug(`Creating new history entry in memory for key: ${key}`);
         // Try loading from disk first if applicable, to merge history correctly
         if (this.storageType === 'disk') {
             await this._loadHistoryFromDisk(key); // This will populate this.history.get(key) if found
             chatHistory = this.history.get(key); // Try getting again
         }
         // If still not found (new history or memory storage), create it
         if (!chatHistory) {
             chatHistory = { messages: [], lastAccess: now, created: now };
             this.history.set(key, chatHistory);
         }
      }

      // Add timestamps if missing from new messages
      const messagesWithTimestamps = newMessages.map(msg => ({
          ...msg,
          content: msg.content ?? null, // Ensure content is null if missing
          timestamp: msg.timestamp || formatDateTime(new Date(now))
      }));

      // Append new messages
      chatHistory.messages.push(...messagesWithTimestamps);
      chatHistory.lastAccess = now; // Update access time

      // Trim history if it exceeds the maximum number of messages
      const overflow = chatHistory.messages.length - this.maxHistoryEntries;
      if (overflow > 0) {
        // Remove the oldest messages from the beginning of the array
        chatHistory.messages.splice(0, overflow);
        this.logger.debug(`History ${key} trimmed to ${this.maxHistoryEntries} messages (removed ${overflow} oldest).`);
      }

      // Save to disk if needed
      let saveSuccess = true;
      if (this.storageType === 'disk') {
          saveSuccess = await this.saveHistory(key); // saveHistory logs errors internally
      }

      this.logger.debug(`Messages added to history ${key}. Current size: ${chatHistory.messages.length} messages. Save status: ${saveSuccess}`);
      return saveSuccess; // Return based on save status if disk, true otherwise
  }

  /** Saves history for specified key to disk (if storageType='disk'). */
  async saveHistory(key: string): Promise<boolean> {
    if (this.storageType !== 'disk') {
        // Only log if debug mode is on to avoid noise
        this.logger.debug(`Skipping saveHistory for ${key} (storageType='memory').`);
        return true; // Saving is "successful" if not applicable
    }
    if (this.isDestroyed) {
         this.logger.warn(`Attempt to save history '${key}' after HistoryManager destruction.`);
         return false;
    }
    if (!key || typeof key !== 'string') {
        this.logger.error('saveHistory called with invalid key.');
        return false;
    }

    const chatHistory = this.history.get(key);
    if (!chatHistory) {
      // This might happen if save is called before history is loaded/created in memory
      this.logger.warn(`Attempt to save history for key '${key}', but it's not found in memory. Load or add messages first.`);
      return false; // Cannot save what's not in memory
    }

    const filename = this._getFilenameFromKey(key);
    const filePath = path.join(this.chatsFolder, filename);
    this.logger.debug(`Saving history ${key} to file: ${filePath}`);

    try {
      await fsPromises.mkdir(this.chatsFolder, { recursive: true });

      // Serialize only the messages array for storage
      const dataToSave = JSON.stringify(chatHistory.messages, null, 2); // Pretty-print JSON
      await fsPromises.writeFile(filePath, dataToSave, 'utf8');
      this.logger.debug(`History ${key} successfully saved to ${filename}.`);
      return true;
    } catch (err) {
      // Log detailed error if saving fails
      this.logger.error(`Error saving history ${key} to file ${filePath}:`, err);
      return false; // Indicate save failure
    }
  }

  /** Loads history for specified key from disk. Only works if storageType='disk'. */
  private async _loadHistoryFromDisk(key: string): Promise<Message[]> {
     if (this.storageType !== 'disk') {
         this.logger.debug(`_loadHistoryFromDisk skipped for key ${key} (storageType='memory').`);
         return [];
     }
     if (this.isDestroyed) {
         this.logger.warn(`Attempt to load history '${key}' from disk after HistoryManager destruction.`);
         return [];
     }
      if (!key || typeof key !== 'string') {
          this.logger.error('_loadHistoryFromDisk called with invalid key.');
          return [];
      }

     const filename = this._getFilenameFromKey(key);
     const filePath = path.join(this.chatsFolder, filename);
     this.logger.debug(`Attempting to load history ${key} from file: ${filePath}`);

     try {
        // Check if file exists and is readable before attempting to read
        await fsPromises.access(filePath, fs.constants.R_OK); // Throws if not accessible

        const data = await fsPromises.readFile(filePath, 'utf8');
        const messages = JSON.parse(data) as Message[]; // Assume file contains array of Message

        // Validate the loaded data structure
        if (!Array.isArray(messages)) {
            throw new Error('History file content is not a valid JSON array.');
        }

        // Get file stats for creation/modification time
        const stats = await fsPromises.stat(filePath);
        const now = Date.now();

        // Trim loaded history to ensure it doesn't exceed maxMessages immediately
        const messagesToKeep = messages.slice(-this.maxHistoryEntries);
        if (messages.length > messagesToKeep.length) {
            this.logger.debug(`Loaded history ${key} was trimmed from ${messages.length} to ${messagesToKeep.length} messages upon loading.`);
        }

        // Create or update the history entry in memory
        const chatHistory: ChatHistory = {
            messages: messagesToKeep.map(m => ({ ...m, content: m.content ?? null })), // Ensure content is null if missing
            lastAccess: now, // Set last access to now
            created: stats.birthtimeMs || now // Use file creation time if available
        };
        this.history.set(key, chatHistory); // Add/update in the memory map

        this.logger.log(`History ${key} successfully loaded from disk (${messagesToKeep.length} messages).`);
        return [...chatHistory.messages]; // Return a copy of the messages

     } catch (err: any) {
         if (err.code === 'ENOENT') {
             // File not found - this is expected for new histories
             this.logger.debug(`History file ${filename} not found for key ${key}. No history loaded.`);
             // Do NOT create an empty memory entry here, let getHistory handle that if needed.
             return []; // Return empty array indicating nothing loaded
         } else {
             // Other errors (read permission, JSON parse error, validation error)
             this.logger.error(`Error loading or parsing history file ${filePath} for key ${key}:`, err);
             // Do not add to memory map on error, allows retry on next getHistory
             return []; // Return empty array on error
         }
     }
  }

  /** Clears messages for a specific history key in memory and optionally on disk. */
  async clearHistory(key: string): Promise<boolean> {
    if (this.isDestroyed) {
        this.logger.warn(`Attempt to clear history '${key}' after HistoryManager destruction.`);
        return false;
    }
    if (!key || typeof key !== 'string') {
        this.logger.error('clearHistory called with invalid key.');
        return false;
    }
    this.logger.log(`Clearing history for key: ${key}`);

    let saveSuccess = true;
    let clearedInMemory = false;

    // Clear in memory
    let chatHistory = this.history.get(key);
    if (chatHistory) {
      if (chatHistory.messages.length > 0) {
          chatHistory.messages = []; // Clear the messages array
          chatHistory.lastAccess = Date.now(); // Update access time
          this.logger.debug(`History ${key} cleared in memory.`);
          clearedInMemory = true;
      } else {
          this.logger.debug(`History ${key} already empty in memory.`);
          clearedInMemory = true; // Already clear is also success
      }
    } else {
      // History doesn't exist in memory, create an empty entry if we need to save to disk
      if (this.storageType === 'disk') {
         this.logger.debug(`History ${key} not found in memory, creating empty entry to clear on disk.`);
         chatHistory = { messages: [], lastAccess: Date.now(), created: Date.now() };
         this.history.set(key, chatHistory);
         clearedInMemory = true; // Considered cleared
      } else {
          this.logger.debug(`History ${key} not found in memory, nothing to clear.`);
          return true; // Nothing to clear is success
      }
    }

    // Save the empty history to disk if applicable
    if (this.storageType === 'disk' && chatHistory) { // Ensure chatHistory exists
        saveSuccess = await this.saveHistory(key); // Will save the empty messages array
        if (!saveSuccess) {
             this.logger.error(`Failed to save cleared history to disk for key: ${key}`);
        }
    }

    return clearedInMemory && saveSuccess;
  }

  /** Completely removes history for a key from memory and disk (if applicable). */
  async deleteHistory(key: string): Promise<boolean> {
     if (this.isDestroyed) {
        this.logger.warn(`Attempt to delete history '${key}' after HistoryManager destruction.`);
        return false;
     }
      if (!key || typeof key !== 'string') {
          this.logger.error('deleteHistory called with invalid key.');
          return false;
      }
     this.logger.log(`Deleting history for key: ${key}`);
     let deletedFromMemory = false;
     let fileDeletionAttempted = false;
     let deletedFromFile = false;

     // Remove from memory
     if (this.history.has(key)) {
        this.history.delete(key);
        deletedFromMemory = true;
        this.logger.debug(`History ${key} removed from memory cache.`);
     } else {
        this.logger.debug(`History ${key} not found in memory cache.`);
     }

     // Remove from disk if applicable
     if (this.storageType === 'disk') {
        fileDeletionAttempted = true;
        const filename = this._getFilenameFromKey(key);
        const filePath = path.join(this.chatsFolder, filename);
        try {
             // Use unlink to delete the file. Throws if file doesn't exist.
             await fsPromises.unlink(filePath);
             deletedFromFile = true;
             this.logger.log(`History file ${filename} removed from disk.`);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                // File not found - considered success in terms of deletion goal
                this.logger.debug(`History file ${filename} not found on disk (already deleted or never existed).`);
                deletedFromFile = true; // Target state achieved
            } else {
                // Other errors (permissions, etc.)
                this.logger.error(`Error deleting history file ${filePath}:`, err);
                deletedFromFile = false; // Deletion failed
            }
        }
     }

     // Return true if deleted from memory OR if file deletion was successful/unnecessary
     return deletedFromMemory || (fileDeletionAttempted ? deletedFromFile : true);
  }

  /** Gets list of all available history keys (from memory or disk scan). */
  async getAllHistoryKeys(): Promise<string[]> {
     if (this.isDestroyed) return [];
     this.logger.debug(`Requesting all history keys (storageType='${this.storageType}')...`);
     try {
       if (this.storageType === 'memory') {
         // Return keys directly from the memory map
         const keys = Array.from(this.history.keys());
         this.logger.debug(`Got ${keys.length} keys from memory.`);
         return keys;
       } else { // storageType === 'disk'
            // Scan the history directory
           let files: string[];
           try {
               // Check if directory exists before reading
               await fsPromises.access(this.chatsFolder, fs.constants.R_OK);
               files = await fsPromises.readdir(this.chatsFolder);
           } catch (readOrAccessError: any) {
                if (readOrAccessError.code === 'ENOENT') {
                     this.logger.debug(`History directory '${this.chatsFolder}' not found. No keys from disk.`);
                     return []; // No directory means no keys
                 }
                // Log other errors (permissions etc.)
                this.logger.error(`Unable to read history directory '${this.chatsFolder}':`, readOrAccessError);
                return []; // Return empty on error
           }

           // Filter files and extract keys
           const keys = files
             .map(f => this._getKeyFromFilename(f)) // Convert filename to key
             .filter((key): key is string => !!key); // Filter out nulls (non-matching files)

           this.logger.debug(`Found ${keys.length} potential history keys by scanning directory '${this.chatsFolder}'.`);
           return keys;
       }
     } catch (err) {
         // Catch unexpected errors
         this.logger.error(`Unexpected error while getting all history keys:`, err);
         return [];
     }
  }

  /** Sets new TTL for history entries. */
  setTTL(ttl: number): void {
     if (typeof ttl === 'number' && ttl > 0) {
        this.logger.log(`History TTL changed to: ${ttl} ms (${(ttl / 1000 / 60 / 60).toFixed(2)} hours)`);
        this.ttl = ttl;
     } else {
        this.logger.warn(`Attempt to set invalid TTL: ${ttl}. Must be a positive number. Using previous value: ${this.ttl} ms.`);
     }
  }

  /** Returns current TTL for history entries in milliseconds. */
  getTTL(): number { return this.ttl; }

  /** Sets new interval for automatic cleanup and restarts the timer. */
  setCleanupInterval(interval: number): void {
     if (typeof interval === 'number' && interval > 0) {
        this.logger.log(`History cleanup interval changed to: ${interval} ms (${(interval / 1000 / 60).toFixed(1)} minutes). Restarting timer.`);
        this.cleanupInterval = interval;
        this.startCleanupTimer(); // Restart timer with the new interval
     } else {
         this.logger.warn(`Attempt to set invalid cleanup interval: ${interval}. Must be a positive number. Using previous value: ${this.cleanupInterval} ms.`);
     }
  }

  /** Releases resources: stops timer, clears memory, removes process handlers. */
  public async destroy(): Promise<void> {
    if (this.isDestroyed) {
        this.logger.debug('HistoryManager already destroyed.');
        return;
    }
    this.logger.log('Destroying HistoryManager...');
    this.isDestroyed = true; // Mark as destroyed immediately

    // 1. Stop the cleanup timer
    this.stopCleanupTimer();

    // 2. Perform final save if configured
    if (this.autoSaveOnExit && this.storageType === 'disk') {
      this.logger.log('Performing final history save before destruction...');
      try {
          await this.saveAllHistories();
          // Log success/failure summary already logged in saveAllHistories
      } catch (error) {
          // Should be caught by saveAllHistories, but log just in case
          this.logger.error('Error during final history save on destroy:', error);
      }
    }

    // 3. Clear the history map in memory
    this.history.clear();
    this.logger.debug('History map in memory cleared.');

    // 4. Remove process exit handlers
    this._removeProcessHandlers();

    this.logger.log('HistoryManager successfully destroyed.');
  }

  /** Sanitizes a key for safe use in a filename. */
  private _sanitizeKeyForFilename(key: string): string {
      if (!key) return '_invalid_key_';
      // Replace common problematic characters for filenames with underscores
      // Allow letters, numbers, underscore, hyphen, double underscore (from colon)
      return key
          .replace(/:/g, '__') // Replace colon first
          .replace(/[^a-zA-Z0-9_-]/g, '_'); // Replace remaining invalid chars
  }

  /** Generates filename from history key. */
  private _getFilenameFromKey(key: string): string {
      const sanitizedKey = this._sanitizeKeyForFilename(key);
      return `chat_history_${sanitizedKey}.json`;
  }

  /** Extracts history key from filename, returns null if filename doesn't match pattern. */
  private _getKeyFromFilename(filename: string): string | null {
      const prefix = 'chat_history_';
      const suffix = '.json';
      if (filename.startsWith(prefix) && filename.endsWith(suffix)) {
          const sanitizedKey = filename.substring(prefix.length, filename.length - suffix.length);
          // Convert back double underscores to colons
          const originalKey = sanitizedKey.replace(/__/g, ':');
          // Basic check if the resulting key seems valid (avoids returning empty strings etc.)
          return originalKey.length > 0 ? originalKey : null;
      }
      return null; // Not a valid history filename
  }
}