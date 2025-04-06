import type { OpenRouterPlugin, IHistoryStorage, Message } from '../types';
import type { OpenRouterClient } from '../client';
// Import ioredis types if needed, or rely on implicit types
import Redis, { RedisOptions } from 'ioredis';
// Use relative path for UnifiedHistoryManager import
import { UnifiedHistoryManager } from './unified-history-manager';

class RedisHistoryStorage implements IHistoryStorage {
  private redis: Redis;
  private prefix: string;

  constructor(redisInstance: Redis, prefix: string = 'chat_history:') {
    if (!redisInstance) {
        throw new Error("[RedisHistoryStorage] Redis instance is required.");
    }
    this.redis = redisInstance;
    this.prefix = prefix;
  }

  private key(rawKey: string): string {
    // Basic sanitization, although Redis keys are quite flexible
    const safeKey = rawKey.replace(/[^a-zA-Z0-9_.\-:]/g, '_');
    return `${this.prefix}${safeKey}`;
  }

  async load(key: string): Promise<Message[]> {
    const redisKey = this.key(key);
    try {
        const data = await this.redis.get(redisKey);
        if (!data) return []; // Key doesn't exist
        try {
            const parsed = JSON.parse(data);
            // Validate if it's an array
            return Array.isArray(parsed) ? parsed : [];
        } catch (parseError) {
            console.error(`[RedisHistoryStorage] Failed to parse JSON data for key ${redisKey}:`, parseError);
            return []; // Return empty on parse error
        }
    } catch (redisError) {
        console.error(`[RedisHistoryStorage] Redis error loading key ${redisKey}:`, redisError);
        throw redisError; // Re-throw Redis errors
    }
  }

  async save(key: string, messages: Message[]): Promise<void> {
    const redisKey = this.key(key);
    try {
        const data = JSON.stringify(messages);
        // Consider adding TTL (EX option) if needed, managed by UnifiedHistoryManager or here?
        // Let's assume TTL is managed externally for now.
        await this.redis.set(redisKey, data);
    } catch (redisError) {
         console.error(`[RedisHistoryStorage] Redis error saving key ${redisKey}:`, redisError);
        throw redisError; // Re-throw Redis errors
    }
  }

  async delete(key: string): Promise<void> {
    const redisKey = this.key(key);
    try {
        await this.redis.del(redisKey);
    } catch (redisError) {
        console.error(`[RedisHistoryStorage] Redis error deleting key ${redisKey}:`, redisError);
        throw redisError; // Re-throw Redis errors
    }
  }

  async listKeys(): Promise<string[]> {
      const pattern = `${this.prefix}*`;
      try {
          // Use SCAN for production environments with many keys to avoid blocking
          // Simple KEYS for smaller setups:
          const keys = await this.redis.keys(pattern);
          // Remove the prefix to return the original-like keys
          return keys.map((k: string) => k.slice(this.prefix.length));
      } catch (redisError) {
          console.error(`[RedisHistoryStorage] Redis error listing keys with pattern ${pattern}:`, redisError);
          throw redisError; // Re-throw Redis errors
      }
  }

  // Optional: Add a destroy method to disconnect Redis if the plugin created the connection
  async destroy(): Promise<void> {
      // Disconnect only if this storage instance OWNS the connection
      // If connection is passed in, the owner should disconnect it.
      // Assuming for this example, the plugin creates and owns it.
      if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
          await this.redis.quit();
          // console.log("[RedisHistoryStorage] Redis connection closed.");
      }
  }
}

/**
 * Creates a plugin that configures OpenRouterClient to use Redis for history.
 *
 * @param redisConfig - Redis connection options (ioredis options) or a connection URL string.
 * @param prefix - Optional prefix for Redis keys. Defaults to 'chat_history:'.
 * @param historyManagerOptions - Optional configuration for UnifiedHistoryManager (TTL, etc.).
 * @returns An OpenRouterPlugin instance.
 */
export function createRedisHistoryPlugin(
    redisConfig: RedisOptions | string,
    prefix: string = 'chat_history:',
    historyManagerOptions: ConstructorParameters<typeof UnifiedHistoryManager>[1] = {} // Get options type from UHM constructor
): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      let redisInstance: Redis | null = null;
      try {
          // Create a new Redis instance specifically for this plugin instance
          redisInstance = new Redis(redisConfig as any); // Cast needed as types slightly differ

          // Optional: Add error handler for the connection
          redisInstance.on('error', (err) => {
             client['logger']?.error?.('[RedisHistoryPlugin] Redis connection error:', err);
          });

          await redisInstance.ping(); // Test connection
          client['logger']?.log?.('[RedisHistoryPlugin] Connected to Redis successfully.');

          const adapter = new RedisHistoryStorage(redisInstance, prefix);

          // Replace the existing history manager
          const oldManager = client.getHistoryManager();
          if (oldManager && typeof oldManager.destroy === 'function') {
              await oldManager.destroy(); // Destroy the old (likely memory) manager
          }

          const newManager = new UnifiedHistoryManager(adapter, historyManagerOptions);
          client['unifiedHistoryManager'] = newManager; // Directly replace the manager instance

          client['logger']?.log?.('Redis history plugin initialized and replaced existing history manager.');

      } catch (error) {
          client['logger']?.error?.('[RedisHistoryPlugin] Failed to initialize Redis connection or plugin:', error);
          // Disconnect if connection was partially successful but setup failed
          if (redisInstance && redisInstance.status !== 'end') {
              await redisInstance.quit();
          }
          // Re-throw or handle error appropriately
          throw new Error(`RedisHistoryPlugin initialization failed: ${(error as Error).message}`);
      }
    }
    // Optional: Add a cleanup function if the plugin needs to disconnect Redis
    // This might be tricky as the plugin instance itself doesn't have a lifecycle managed by the client.
    // Cleanup should ideally happen when the client is destroyed.
    // Perhaps the adapter's destroy method (called by client.destroy -> manager.destroy) handles it.
  };
}