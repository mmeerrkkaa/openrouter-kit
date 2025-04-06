// Path: src/security/rate-limit-manager.ts
// Import necessary types from the security types file
import {
  IRateLimitManager,
  RateLimitParams,
  RateLimitResult,
  ExtendedRateLimit as RateLimit // Import the extended RateLimit type and alias it locally
} from './types';
import { Logger } from '../utils/logger';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

// Interface for internal storage entry
interface RateLimitEntry {
count: number; // Current request count in the window
resetTime: number; // Timestamp (ms) when the count resets
limit: number; // The request limit for this window
windowMs: number; // The duration of the window in ms
}

/**
* In-memory rate limiter.
* WARNING: This implementation is NOT suitable for distributed/multi-process environments
* as the state is local to each instance. Use an external store (e.g., Redis) for scaling.
*/
export class RateLimitManager implements IRateLimitManager {
// Use a standard Map for storing rate limit state
private limits: Map<string, RateLimitEntry> = new Map();
private eventEmitter: SimpleEventEmitter;
private logger: Logger;
private debugMode: boolean = false;
// Timer for cleaning up very old entries (optional, helps manage memory)
private cleanupIntervalId: NodeJS.Timeout | null = null;
private readonly DEFAULT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

constructor(eventEmitter: SimpleEventEmitter, logger: Logger) {
  this.eventEmitter = eventEmitter;
  this.logger = logger;
  // Start periodic cleanup of potentially stale entries
  this.startCleanupTimer(this.DEFAULT_CLEANUP_INTERVAL_MS);
}

setDebugMode(debug: boolean): void {
  this.debugMode = debug;
   if (typeof (this.logger as any).setDebug === 'function') {
      (this.logger as any).setDebug(debug);
  }
}

private startCleanupTimer(intervalMs: number): void {
    this.stopCleanupTimer(); // Clear existing timer first
    if (intervalMs > 0 && !this.cleanupIntervalId) { // Start only if interval is positive and not already running
        this.cleanupIntervalId = setInterval(() => this.cleanupExpiredLimits(), intervalMs);
        // Allow Node.js to exit even if timer is active
        if (this.cleanupIntervalId?.unref) {
            this.cleanupIntervalId.unref();
        }
        this.logger.debug(`Rate limit state cleanup timer started (Interval: ${intervalMs}ms).`);
    }
}

public stopCleanupTimer(): void {
    if (this.cleanupIntervalId) {
        clearInterval(this.cleanupIntervalId);
        this.cleanupIntervalId = null;
        this.logger.debug("Rate limit state cleanup timer stopped.");
    }
}

/**
 * Parses the RateLimit configuration to get the window size in milliseconds.
 * @returns Window size in ms, or 0 if invalid.
 */
private getTimeWindowMs(rateLimit: RateLimit): number { // Use aliased RateLimit (ExtendedRateLimit)
    const { interval, period } = rateLimit;
    let timeWindowMs = 0;

    if (interval !== undefined) {
        if (typeof interval === 'number') {
            timeWindowMs = interval > 0 ? interval * 1000 : 0; // Assume number is seconds
        } else if (typeof interval === 'string') {
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
            } else if (/^\d+$/.test(interval)) {
                // Allow plain numbers as strings, treat as seconds
                 timeWindowMs = parseInt(interval, 10) * 1000;
            }
        }
    } else if (period) { // Fallback to period if interval not set
        switch (period) {
            case 'second': timeWindowMs = 1000; break;
            case 'minute': timeWindowMs = 60 * 1000; break;
            case 'hour': timeWindowMs = 60 * 60 * 1000; break;
            case 'day': timeWindowMs = 24 * 60 * 60 * 1000; break;
        }
    }

    if (timeWindowMs <= 0) {
        this.logger.warn(`Invalid Rate Limit interval/period defined: ${JSON.stringify(rateLimit)}. Defaulting window to 60000ms.`);
        return 60000; // Default to 1 minute if invalid config
    }
    return timeWindowMs;
}

/**
 * Checks if a request is allowed based on the defined rate limit.
 * Increments the counter if the request is allowed.
 * @param params - RateLimitParams containing identifiers and limit config.
 * @returns RateLimitResult indicating if allowed and current state.
 */
checkRateLimit(params: RateLimitParams): RateLimitResult { // RateLimitParams uses ExtendedRateLimit
  const { userId, toolName, rateLimit, source = 'default' } = params;

  // Basic validation of inputs
  if (!userId || !toolName || !rateLimit || typeof rateLimit.limit !== 'number' || rateLimit.limit <= 0) {
      this.logger.error("Invalid parameters for checkRateLimit.", params);
      // Deny request if parameters are invalid to prevent unexpected allowance
      return { allowed: false, currentCount: 0, limit: rateLimit?.limit || 0, resetTime: new Date(0) };
  }

  // Generate a unique key for this specific limit (user + tool + source identifier)
  const key = `rate_limit:${userId}:${toolName}:${source}`;
  this.logger.debug(`Checking Rate Limit for key '${key}'`);

  const now = Date.now();
  const timeWindowMs = this.getTimeWindowMs(rateLimit);
  const limitValue = rateLimit.limit;

  let entry = this.limits.get(key);

  // Check if entry exists and is still within its valid time window
  if (!entry || entry.resetTime <= now) {
     // Create or reset the entry for a new window
     this.logger.debug(`Creating/resetting Rate Limit entry for key '${key}' (Limit: ${limitValue}, Window: ${timeWindowMs}ms)`);
     const newResetTime = now + timeWindowMs;
     entry = { count: 1, resetTime: newResetTime, limit: limitValue, windowMs: timeWindowMs };
     this.limits.set(key, entry);

     this.eventEmitter.emit('ratelimit:new', { userId, toolName, source, limit: limitValue, resetTime: new Date(newResetTime), windowMs: timeWindowMs });

     // First request in a new window is always allowed
     return { allowed: true, currentCount: 1, limit: limitValue, resetTime: new Date(newResetTime) };
  }

  // Entry exists and is within the current window, increment count
  entry.count++;
  const allowed = entry.count <= entry.limit;
  const resetTimeDate = new Date(entry.resetTime);
  const timeLeftMs = Math.max(0, entry.resetTime - now); // Time left in ms

  // Update the entry in the map (count incremented)
  this.limits.set(key, entry);

  if (!allowed) {
     // Limit exceeded
     const timeLeftSec = Math.ceil(timeLeftMs / 1000);
     this.logger.warn(`Rate Limit EXCEEDED for key '${key}'. Count: ${entry.count}, Limit: ${entry.limit}. Reset in ${timeLeftSec}s.`);
     this.eventEmitter.emit('ratelimit:exceeded', { userId, toolName, source, currentCount: entry.count, limit: entry.limit, resetTime: resetTimeDate, timeLeftMs });
  } else {
     // Limit check passed
      this.logger.debug(`Rate Limit check PASSED for key '${key}'. Count: ${entry.count}, Limit: ${entry.limit}`);
  }

  return { allowed, currentCount: entry.count, limit: entry.limit, resetTime: resetTimeDate, timeLeft: timeLeftMs };
}

/** Clears rate limits, optionally for a specific user. */
clearLimits(userId?: string): void {
  if (userId) {
    // Clear only for the specified user
    const prefix = `rate_limit:${userId}:`;
    const keysToDelete: string[] = [];
    for (const key of this.limits.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.limits.delete(key));
    this.logger.log(`Cleared Rate Limit state for user '${userId}' (${keysToDelete.length} entries removed).`);
    this.eventEmitter.emit('ratelimit:cleared', { userId });
  } else {
    // Clear all limits
    const count = this.limits.size;
    this.limits.clear();
    this.logger.log(`Cleared ALL Rate Limit state (${count} entries removed).`);
    this.eventEmitter.emit('ratelimit:cleared', { all: true });
  }
}

/** Periodically removes very old/stale entries from the map to manage memory. */
private cleanupExpiredLimits(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  const cleanupThresholdFactor = 3; // Remove entries whose reset time is > 3 windows in the past

  this.logger.debug("Running periodic cleanup of stale Rate Limit entries...");
  for (const [key, entry] of this.limits.entries()) {
    // Check if the entry's reset time is significantly in the past
    if (entry.resetTime + (entry.windowMs * cleanupThresholdFactor) < now) {
      keysToDelete.push(key);
    }
  }

  if (keysToDelete.length > 0) {
    keysToDelete.forEach(key => this.limits.delete(key));
    this.logger.log(`Cleaned up ${keysToDelete.length} stale Rate Limit entries.`);
    this.eventEmitter.emit('ratelimit:stale_removed', { count: keysToDelete.length });
  } else {
      this.logger.debug("No stale Rate Limit entries found during cleanup.");
  }
}

 // Destroys the manager, clearing timers and state.
 destroy(): void {
     this.stopCleanupTimer(); // Stop the cleanup timer
     this.limits.clear(); // Clear the rate limit state
     this.logger.log("RateLimitManager destroyed.");
 }
}