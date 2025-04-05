import type { OpenRouterPlugin, IHistoryStorage, Message } from '../types';
import type { OpenRouterClient } from '../client';
import Redis from 'ioredis';

class RedisHistoryStorage implements IHistoryStorage {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix = 'chat_history:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async load(key: string): Promise<Message[]> {
    const data = await this.redis.get(this.key(key));
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async save(key: string, messages: Message[]): Promise<void> {
    await this.redis.set(this.key(key), JSON.stringify(messages));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }

  async listKeys(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.prefix}*`);
    return keys.map((k: string) => k.slice(this.prefix.length));
  }
}

export function createRedisHistoryPlugin(redisUrl: string, prefix = 'chat_history:'): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const redis = new Redis(redisUrl);
      const adapter = new RedisHistoryStorage(redis, prefix);
      const { UnifiedHistoryManager } = require('./unified-history-manager');
      const manager = new UnifiedHistoryManager(adapter);
      client['unifiedHistoryManager'] = manager;
      client['logger']?.log?.('Redis history plugin initialized');
    }
  };
}