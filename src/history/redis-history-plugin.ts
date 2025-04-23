// Path: src/history/redis-history-plugin.ts
import type { OpenRouterPlugin, IHistoryStorage, HistoryEntry, Message } from '../types'; // Import HistoryEntry
import type { OpenRouterClient } from '../client';
import Redis, { RedisOptions } from 'ioredis';
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
    const safeKey = rawKey.replace(/[^a-zA-Z0-9_.\-:]/g, '_');
    return `${this.prefix}${safeKey}`;
  }

  async load(key: string): Promise<HistoryEntry[]> {
    const redisKey = this.key(key);
    try {
        const data = await this.redis.get(redisKey);
        if (!data) return [];
        try {
            const parsedData = JSON.parse(data);
            if (!Array.isArray(parsedData)) {
                console.error(`[RedisHistoryStorage] Data for key ${redisKey} is not an array.`);
                return [];
            }

            // Basic check for old vs new format
            if (parsedData.length > 0 && parsedData[0].role && parsedData[0].content !== undefined) {
                console.warn(`[RedisHistoryStorage] Data for key ${redisKey} appears to be in the old Message[] format. Converting to HistoryEntry[] without metadata.`);
                return parsedData.map((msg: Message) => ({ message: msg, apiCallMetadata: null }));
            } else if (parsedData.length === 0 || (parsedData[0].message && parsedData[0].message.role)) {
                return parsedData as HistoryEntry[];
            } else {
                 console.warn(`[RedisHistoryStorage] Data for key ${redisKey} has an unrecognized format. Returning empty.`);
                 return [];
            }

        } catch (parseError) {
            console.error(`[RedisHistoryStorage] Failed to parse JSON data for key ${redisKey}:`, parseError);
            return [];
        }
    } catch (redisError) {
        console.error(`[RedisHistoryStorage] Redis error loading key ${redisKey}:`, redisError);
        throw redisError;
    }
  }

  async save(key: string, entries: HistoryEntry[]): Promise<void> {
    const redisKey = this.key(key);
    try {
        const data = JSON.stringify(entries);
        await this.redis.set(redisKey, data);
    } catch (redisError) {
         console.error(`[RedisHistoryStorage] Redis error saving key ${redisKey}:`, redisError);
        throw redisError;
    }
  }

  async delete(key: string): Promise<void> {
    const redisKey = this.key(key);
    try {
        await this.redis.del(redisKey);
    } catch (redisError) {
        console.error(`[RedisHistoryStorage] Redis error deleting key ${redisKey}:`, redisError);
        throw redisError;
    }
  }

  async listKeys(): Promise<string[]> {
      const pattern = `${this.prefix}*`;
      try {
          const keys = await this.redis.keys(pattern);
          return keys.map((k: string) => k.slice(this.prefix.length));
      } catch (redisError) {
          console.error(`[RedisHistoryStorage] Redis error listing keys with pattern ${pattern}:`, redisError);
          throw redisError;
      }
  }

  async destroy(): Promise<void> {
      if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
          await this.redis.quit();
      }
  }
}

export function createRedisHistoryPlugin(
    redisConfig: RedisOptions | string,
    prefix: string = 'chat_history:',
    historyManagerOptions: ConstructorParameters<typeof UnifiedHistoryManager>[1] = {}
): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      let redisInstance: Redis | null = null;
      try {
          redisInstance = new Redis(redisConfig as any);

          redisInstance.on('error', (err) => {
             (client as any)['logger']?.error?.('[RedisHistoryPlugin] Redis connection error:', err);
          });

          await redisInstance.ping();
          (client as any)['logger']?.log?.('[RedisHistoryPlugin] Connected to Redis successfully.');

          const adapter = new RedisHistoryStorage(redisInstance, prefix);

          const oldManager = client.getHistoryManager();
          if (oldManager && typeof oldManager.destroy === 'function') {
              await oldManager.destroy();
          }

          // Pass logger correctly
          const newManager = new UnifiedHistoryManager(adapter, historyManagerOptions, (client as any)['logger']?.withPrefix('UnifiedHistoryManager'));
          (client as any)['unifiedHistoryManager'] = newManager;

          (client as any)['logger']?.log?.('Redis history plugin initialized and replaced existing history manager.');

      } catch (error) {
          (client as any)['logger']?.error?.('[RedisHistoryPlugin] Failed to initialize Redis connection or plugin:', error);
          if (redisInstance && redisInstance.status !== 'end') {
              await redisInstance.quit();
          }
          throw new Error(`RedisHistoryPlugin initialization failed: ${(error as Error).message}`);
      }
    }
  };
}