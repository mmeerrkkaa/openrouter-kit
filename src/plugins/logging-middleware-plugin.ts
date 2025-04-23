// Path: src/plugins/logging-middleware-plugin.ts
import type { OpenRouterPlugin, MiddlewareContext } from '../types';
import type { OpenRouterClient } from '../client';
import { OpenRouterError } from '../utils/error';
import { mapError } from '../utils/error';

/**
 * Example plugin that registers a simple logging middleware.
 */
export function createLoggingMiddlewarePlugin(): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const logger = (client as any)['logger']?.withPrefix('LoggingMiddleware');

      if (!logger) {
          console.warn("[LoggingMiddlewarePlugin] Client logger not found, middleware will not log.");
          return;
      }

      const loggingMiddleware = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
        const startTime = Date.now();
        // Use the public getter for the default model
        const defaultModel = client.getDefaultModel(); // Use the getter
        const requestOptionsSummary = {
            model: ctx.request.options.model || defaultModel,
            promptLength: ctx.request.options.prompt?.length,
            customMessagesCount: ctx.request.options.customMessages?.length,
            user: ctx.request.options.user,
            toolsCount: ctx.request.options.tools?.length,
            responseFormat: ctx.request.options.responseFormat?.type,
        };
        logger.log(`Request starting...`, requestOptionsSummary);

        try {
            await next();

            const duration = Date.now() - startTime;
            if (ctx.response && !ctx.response.error) {
                const responseSummary = {
                    model: ctx.response.result?.model,
                    finishReason: ctx.response.result?.finishReason,
                    toolCallsCount: ctx.response.result?.toolCallsCount,
                    usage: ctx.response.result?.usage,
                    cost: ctx.response.result?.cost,
                    contentType: typeof ctx.response.result?.content,
                    id: ctx.response.result?.id,
                };
                 logger.log(`Request finished successfully in ${duration}ms.`, responseSummary);
                 logger.debug(`Full response content:`, ctx.response.result?.content);
            } else if (ctx.response?.error) {
                 const error = ctx.response.error as OpenRouterError;
                 logger.error(`Request failed after ${duration}ms. Error: ${error.message} (Code: ${error.code}, Status: ${error.statusCode || 'N/A'})`);
                 logger.debug(`Error details:`, error.details || error);
            } else {
                 logger.warn(`Request finished in ${duration}ms but context has no response or error.`);
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const mappedError = mapError(error);
            logger.error(`Request middleware chain interrupted after ${duration}ms. Unhandled Error: ${mappedError.message}`, mappedError);
            throw mappedError;
        }
      };

      client.useMiddleware(loggingMiddleware);
      logger.log('Logging middleware registered.');
    }
  };
}