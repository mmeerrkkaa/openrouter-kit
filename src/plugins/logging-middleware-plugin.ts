import type { OpenRouterPlugin, MiddlewareContext } from '../types';
import type { OpenRouterClient } from '../client';
// Use relative path for error type import
import { OpenRouterError } from '../utils/error';
import { mapError } from '../utils/error';

/**
 * Example plugin that registers a simple logging middleware.
 * This middleware logs basic information about requests and responses flowing through the client.chat method.
 */
export function createLoggingMiddlewarePlugin(): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const logger = client['logger']?.withPrefix('LoggingMiddleware'); // Get client logger

      if (!logger) {
          console.warn("[LoggingMiddlewarePlugin] Client logger not found, middleware will not log.");
          return;
      }

      // Define the middleware function
      const loggingMiddleware = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
        const startTime = Date.now();
        const requestOptionsSummary = {
            model: ctx.request.options.model || client['model'], // Use client default if not in options
            promptLength: ctx.request.options.prompt?.length,
            customMessagesCount: ctx.request.options.customMessages?.length,
            user: ctx.request.options.user,
            toolsCount: ctx.request.options.tools?.length,
            responseFormat: ctx.request.options.responseFormat?.type,
        };
        logger.log(`Request starting...`, requestOptionsSummary);

        try {
            // Call the next middleware or the core chat function
            await next();

            const duration = Date.now() - startTime;
            // Log successful response summary
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
                 // Optionally log full result content in debug mode
                 logger.debug(`Full response content:`, ctx.response.result?.content);
            } else if (ctx.response?.error) {
                 // Error should have been handled by the core logic or another middleware
                 const error = ctx.response.error as OpenRouterError;
                 logger.error(`Request failed after ${duration}ms. Error: ${error.message} (Code: ${error.code}, Status: ${error.statusCode || 'N/A'})`);
                 logger.debug(`Error details:`, error.details || error);
            } else {
                 // Should not happen if next() resolves without setting response/error
                 logger.warn(`Request finished in ${duration}ms but context has no response or error.`);
            }
        } catch (error) {
            // Catch errors that might propagate *up* from next() if not handled internally
            const duration = Date.now() - startTime;
            const mappedError = mapError(error); // Ensure it's mapped
            logger.error(`Request middleware chain interrupted after ${duration}ms. Unhandled Error: ${mappedError.message}`, mappedError);
            // Re-throw the error so the client's main catch block handles it
            throw mappedError;
        }
      };

      // Register the middleware with the client
      client.useMiddleware(loggingMiddleware);
      logger.log('Logging middleware registered.');
    }
  };
}