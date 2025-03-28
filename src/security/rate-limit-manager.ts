import { IRateLimitManager, RateLimitParams, RateLimitResult, ExtendedRateLimit } from './types';
import { Logger } from '../utils/logger';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter'; // Use SimpleEventEmitter

interface RateLimitEntry {
  count: number;
  resetTime: Date;
  limit: number;
}

export class RateLimitManager implements IRateLimitManager {
  private limits: Map<string, RateLimitEntry> = new Map();
  private eventEmitter: SimpleEventEmitter; // Changed type
  private logger: Logger;
  private debugMode: boolean = false;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(eventEmitter: SimpleEventEmitter, logger: Logger) { // Changed type
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.startCleanupTimer();
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  private startCleanupTimer(): void {
      if (this.cleanupIntervalId) {
          clearInterval(this.cleanupIntervalId);
          this.logger.debug("Previous rate limit cleanup timer stopped.");
      }
      const interval = 10 * 60 * 1000;
      this.cleanupIntervalId = setInterval(() => this.cleanupExpiredLimits(), interval);
      if (this.cleanupIntervalId && typeof this.cleanupIntervalId.unref === 'function') {
          this.cleanupIntervalId.unref();
      }
      this.logger.debug(`Rate limit cleanup timer started with interval ${interval} ms.`);
  }

  public stopCleanupTimer(): void {
      if (this.cleanupIntervalId) {
          clearInterval(this.cleanupIntervalId);
          this.cleanupIntervalId = null;
          this.logger.debug("Rate limit cleanup timer stopped.");
      }
  }

  checkRateLimit(params: RateLimitParams): RateLimitResult {
    const { userId, toolName, rateLimit, source = 'default' } = params;
    const key = `${userId}:${toolName}:${source}`;
    this.logger.debug(`Checking Rate Limit for key '${key}'`);

    const now = new Date();
    let entry = this.limits.get(key);

    if (!entry || entry.resetTime < now) {
       this.logger.debug(`Creating/resetting Rate Limit entry for key '${key}'`);
      const resetTime = new Date();
      let timeWindowMs = 0;

      const interval = rateLimit.interval;
      if (typeof interval === 'string') {
        const match = interval.match(/^(\d+)(s|m|h|d)$/);
        if (match) {
          const [, amount, unit] = match;
          const value = parseInt(amount, 10);
          switch (unit) {
            case 's': timeWindowMs = value * 1000; break;
            case 'm': timeWindowMs = value * 60 * 1000; break;
            case 'h': timeWindowMs = value * 60 * 60 * 1000; break;
            case 'd': timeWindowMs = value * 24 * 60 * 60 * 1000; break;
          }
        }
      } else if (typeof interval === 'number') {
        timeWindowMs = interval * 1000;
      } else {
        switch (rateLimit.period) {
          case 'second': timeWindowMs = 1000; break;
          case 'minute': timeWindowMs = 60 * 1000; break;
          case 'hour': timeWindowMs = 60 * 60 * 1000; break;
          case 'day': timeWindowMs = 24 * 60 * 60 * 1000; break;
          default: timeWindowMs = 60 * 1000;
        }
      }

      if (timeWindowMs <= 0) {
           this.logger.warn(`Invalid Rate Limit interval (${rateLimit.period} / ${rateLimit.interval}). Using 60 seconds.`);
           timeWindowMs = 60000;
      }

      resetTime.setTime(resetTime.getTime() + timeWindowMs);
      const limitValue = rateLimit.limit; // Use 'limit' directly now

      entry = { count: 1, resetTime, limit: limitValue };
      this.limits.set(key, entry);

      this.logger.debug(`New limit for '${key}': ${limitValue} requests, reset at ${resetTime.toISOString()}`);
      this.eventEmitter.emit('ratelimit:new', { userId, toolName, source, limit: limitValue, resetTime });

      return { allowed: true, currentCount: 1, limit: limitValue, resetTime };
    }

    entry.count++;
    const allowed = entry.count <= entry.limit;
    const timeLeft = Math.max(0, entry.resetTime.getTime() - now.getTime());

    if (!allowed) {
       this.logger.warn(`Rate Limit exceeded for key '${key}'. Current: ${entry.count}, Limit: ${entry.limit}. Reset in ${Math.ceil(timeLeft / 1000)} sec.`);
      this.eventEmitter.emit('ratelimit:exceeded', { userId, toolName, source, currentCount: entry.count, limit: entry.limit, resetTime: entry.resetTime });
    } else {
        this.logger.debug(`Rate Limit check passed for key '${key}'. Current: ${entry.count}, Limit: ${entry.limit}`);
    }

    return { allowed, currentCount: entry.count, limit: entry.limit, resetTime: entry.resetTime, timeLeft };
  }

  clearLimits(userId?: string): void {
    if (userId) {
      const keysToDelete: string[] = [];
      for (const key of this.limits.keys()) {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.limits.delete(key));
      this.logger.log(`Cleared Rate Limit limits for user ${userId} (${keysToDelete.length} entries).`);
      this.eventEmitter.emit('ratelimit:cleared', { userId });
    } else {
      const count = this.limits.size;
      this.limits.clear();
      this.logger.log(`Cleared all Rate Limit limits (${count} entries).`);
      this.eventEmitter.emit('ratelimit:cleared', { all: true });
    }
  }

  private cleanupExpiredLimits(): void {
    const now = new Date();
    const expiredKeys: string[] = [];
    this.logger.debug("Starting cleanup of expired Rate Limit entries...");
    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetTime < now) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      expiredKeys.forEach(key => this.limits.delete(key));
      this.logger.log(`Cleaned up ${expiredKeys.length} expired Rate Limit entries.`);
      this.eventEmitter.emit('ratelimit:expired', { count: expiredKeys.length });
    } else {
        this.logger.debug("No expired Rate Limit entries found.");
    }
  }

   destroy(): void {
       this.stopCleanupTimer();
       this.limits.clear();
       this.logger.log("RateLimitManager destroyed.");
   }
}