// Path: src/core/plugin-manager.ts
import { OpenRouterPlugin, MiddlewareFunction, MiddlewareContext } from '../types';
import { OpenRouterClient } from '../client';
import { Logger } from '../utils/logger';
import { mapError, ConfigError, OpenRouterError, ErrorCode } from '../utils/error';

export class PluginManager { // Ensure export
    private plugins: OpenRouterPlugin[] = [];
    private middlewares: MiddlewareFunction[] = [];
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger.withPrefix('PluginManager');
        this.logger.log('PluginManager initialized.');
    }

    public async registerPlugin(plugin: OpenRouterPlugin, client: OpenRouterClient): Promise<void> {
        if (!plugin || typeof plugin.init !== 'function') {
            throw new ConfigError('Invalid plugin: missing init() method or plugin is not an object');
        }
        try {
            await plugin.init(client);
            this.plugins.push(plugin);
            this.logger.log(`Plugin registered: ${plugin.constructor?.name || 'anonymous plugin'}`);
        } catch (error) {
            const mappedError = mapError(error);
            this.logger.error(`Error initializing plugin ${plugin.constructor?.name || 'anonymous plugin'}: ${mappedError.message}`, mappedError.details);
            throw mappedError;
        }
    }

    public registerMiddleware(fn: MiddlewareFunction): void {
        if (typeof fn !== 'function') {
            throw new ConfigError('Middleware must be a function');
        }
        this.middlewares.push(fn);
        this.logger.log(`Middleware registered: ${fn.name || 'anonymous'}`);
    }

    public async runMiddlewares(ctx: MiddlewareContext, coreFn: () => Promise<void>): Promise<void> {
        const stack = this.middlewares.slice();

        const dispatch = async (i: number): Promise<void> => {
            if (i < stack.length) {
                const middleware = stack[i];
                const middlewareName = middleware.name || `middleware[${i}]`;
                this.logger.debug(`Executing middleware: ${middlewareName}`);
                try {
                    await middleware(ctx, () => dispatch(i + 1));
                    this.logger.debug(`Finished middleware: ${middlewareName}`);
                } catch (mwError) {
                    this.logger.error(`Error in middleware ${middlewareName}:`, mwError);
                    ctx.response = { ...(ctx.response || {}), error: mapError(mwError) };
                    throw mapError(mwError);
                }
            } else {
                this.logger.debug('Executing core chat function...');
                await coreFn();
                this.logger.debug('Finished core chat function.');
            }
        };

        this.logger.debug(`Starting middleware chain execution (${stack.length} middlewares)...`);
        await dispatch(0);
        this.logger.debug('Middleware chain execution finished.');
    }

    public async destroyPlugins(): Promise<void> {
        this.logger.log(`Destroying ${this.plugins.length} registered plugins...`);
        for (const plugin of this.plugins) {
            if (plugin.destroy && typeof plugin.destroy === 'function') {
                try {
                    await plugin.destroy();
                    this.logger.debug(`Plugin destroyed: ${plugin.constructor?.name || 'anonymous plugin'}`);
                } catch (error) {
                    this.logger.error(`Error destroying plugin ${plugin.constructor?.name || 'anonymous plugin'}:`, error);
                }
            }
        }
        this.plugins = [];
        this.middlewares = [];
        this.logger.log('Plugins destroyed and middlewares cleared.');
    }
}


export {};