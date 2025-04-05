import type { OpenRouterPlugin, MiddlewareContext } from '../types';
import type { OpenRouterClient } from '../client';

/**
 * Example plugin that adds logging middleware.
 * Logs request and response info.
 */
export function createLoggingMiddlewarePlugin(): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      client.useMiddleware(async (ctx: MiddlewareContext, next) => {
        const logger = client['logger'];
        logger?.log?.('[Middleware] Request options:', ctx.request.options);
        const start = Date.now();
        await next();
        const duration = Date.now() - start;
        logger?.log?.(`[Middleware] Response after ${duration}ms:`, ctx.response);
      });
      client['logger']?.log?.('Logging middleware plugin initialized');
    }
  };
}