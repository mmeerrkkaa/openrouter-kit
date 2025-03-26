import { IRateLimitManager, RateLimitParams, RateLimitResult, ExtendedRateLimit, ISecurityEventEmitter } from './types';
import { Logger } from '../utils/logger';

interface RateLimitEntry {
  count: number;
  resetTime: Date;
  limit: number;
}

export class RateLimitManager implements IRateLimitManager {
  private limits: Map<string, RateLimitEntry> = new Map();
  private eventEmitter: ISecurityEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;
  private cleanupIntervalId: NodeJS.Timeout | null = null; // For correctly stopping the timer

  /**
   * Creates a RateLimitManager instance.
   * @param eventEmitter Security event emitter instance.
   * @param logger Logger instance. // Added logger
   */
  constructor(eventEmitter: ISecurityEventEmitter, logger: Logger) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.startCleanupTimer(); // Start the timer
  }

  /**
   * Sets the debug mode.
   */
  setDebugMode(debug: boolean): void { // Added method
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  /**
   * Starts the timer for cleaning up expired limits.
   * @private
   */
  private startCleanupTimer(): void {
      if (this.cleanupIntervalId) {
          clearInterval(this.cleanupIntervalId);
          this.logger.debug("Previous rate limit cleanup timer stopped.");
      }
      const interval = 10 * 60 * 1000; // 10 minutes
      this.cleanupIntervalId = setInterval(() => this.cleanupExpiredLimits(), interval);
      // Prevent the Node.js process from being held open just because of the timer
      if (this.cleanupIntervalId && typeof this.cleanupIntervalId.unref === 'function') {
          this.cleanupIntervalId.unref();
      }
      this.logger.debug(`Rate limit cleanup timer started with interval ${interval} ms.`);
  }

  /**
   * Stops the cleanup timer.
   */
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

    // If no entry exists or the reset time has passed
    if (!entry || entry.resetTime < now) {
       this.logger.debug(`Creating/resetting Rate Limit entry for key '${key}'`);
      const resetTime = new Date();
      let timeWindowMs = 0;

      // Determine the time window in milliseconds from the rateLimit config
      const interval = rateLimit.interval;
      if (typeof interval === 'string') {
        // Parse string interval like "10s", "5m", "1h", "1d"
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
        // Assume number interval is in seconds
        timeWindowMs = interval * 1000;
      } else {
        // Fallback to period if interval is not provided
        switch (rateLimit.period) {
          case 'second': timeWindowMs = 1000; break;
          case 'minute': timeWindowMs = 60 * 1000; break;
          case 'hour': timeWindowMs = 60 * 60 * 1000; break;
          case 'day': timeWindowMs = 24 * 60 * 60 * 1000; break;
          default: timeWindowMs = 60 * 1000; // Default to minute
        }
      }

      // Ensure a valid time window, default to 60 seconds if invalid
      if (timeWindowMs <= 0) {
           this.logger.warn(`Invalid Rate Limit interval (${rateLimit.period} / ${rateLimit.interval}). Using 60 seconds.`);
           timeWindowMs = 60000;
      }

      // Calculate the reset time
      resetTime.setTime(resetTime.getTime() + timeWindowMs);
      // Get the limit value (prefer maxRequests for backward compatibility, then limit)
      const limitValue = rateLimit.maxRequests ?? rateLimit.limit;

      // Create the new entry
      entry = { count: 1, resetTime, limit: limitValue };
      this.limits.set(key, entry);

      this.logger.debug(`New limit for '${key}': ${limitValue} requests, reset at ${resetTime.toISOString()}`);
      // Emit event for new limit creation/reset
      this.eventEmitter.emit('ratelimit:new', { userId, toolName, source, limit: limitValue, resetTime });

      // Allow the first request
      return { allowed: true, currentCount: 1, limit: limitValue, resetTime };
    }

    // Increment the count for the existing entry
    entry.count++;
    const allowed = entry.count <= entry.limit;
    const timeLeft = Math.max(0, entry.resetTime.getTime() - now.getTime()); // Calculate time remaining until reset

    if (!allowed) {
       // Log warning and emit event if limit is exceeded
       this.logger.warn(`Rate Limit exceeded for key '${key}'. Current: ${entry.count}, Limit: ${entry.limit}. Reset in ${Math.ceil(timeLeft / 1000)} sec.`);
      this.eventEmitter.emit('ratelimit:exceeded', { userId, toolName, source, currentCount: entry.count, limit: entry.limit, resetTime: entry.resetTime });
    } else {
        // Log success if limit is not exceeded
        this.logger.debug(`Rate Limit check passed for key '${key}'. Current: ${entry.count}, Limit: ${entry.limit}`);
    }

    // Return the result including whether the request is allowed, current count, limit, reset time, and time left
    return { allowed, currentCount: entry.count, limit: entry.limit, resetTime: entry.resetTime, timeLeft };
  }

  clearLimits(userId?: string): void {
    if (userId) {
      // Clear limits only for a specific user
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
      // Clear all limits
      const count = this.limits.size;
      this.limits.clear();
      this.logger.log(`Cleared all Rate Limit limits (${count} entries).`);
      this.eventEmitter.emit('ratelimit:cleared', { all: true });
    }
  }

  /**
   * Cleans up expired rate limit entries from the map.
   * @private
   */
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

   /**
    * Called during SecurityManager destruction to clean up timers and cache.
    */
   destroy(): void {
       this.stopCleanupTimer(); // Stop the cleanup interval
       this.limits.clear();     // Clear the limits map
       this.logger.log("RateLimitManager destroyed.");
   }
}