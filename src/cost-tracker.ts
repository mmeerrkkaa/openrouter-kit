// Path: src/cost-tracker.ts
import { AxiosInstance } from 'axios'; // Keep AxiosInstance for now
import { Logger } from './utils/logger';
import { ModelPricingInfo, UsageInfo, OpenRouterConfig } from './types';
import { mapError, APIError } from './utils/error';
// import { ApiHandler } from './core/api-handler'; // Import if using ApiHandler

const DEFAULT_PRICE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MODELS_API_PATH = '/models'; // Path relative to base API URL passed from client

export class CostTracker {
    private priceCache: Map<string, ModelPricingInfo> = new Map();
    // TODO: Refactor to use ApiHandler.getModels() instead of direct AxiosInstance?
    private axiosInstance: AxiosInstance; // Used for making requests
    private logger: Logger;
    private refreshIntervalMs: number;
    private refreshTimer: NodeJS.Timeout | null = null;
    private isFetchingPrices: boolean = false;
    private initialPricesProvided: boolean = false;
    private apiBaseUrl: string; // Store the base URL for the /models endpoint

    constructor(
        // Keep AxiosInstance for now, but consider passing ApiHandler in the future
        axiosInstance: AxiosInstance,
        logger: Logger,
        config: Pick<OpenRouterConfig, 'enableCostTracking' | 'priceRefreshIntervalMs' | 'initialModelPrices'> & { apiBaseUrl: string }
    ) {
        this.axiosInstance = axiosInstance;
        this.logger = logger.withPrefix('CostTracker');
        this.refreshIntervalMs = config.priceRefreshIntervalMs ?? DEFAULT_PRICE_REFRESH_INTERVAL_MS;

        if (!config.apiBaseUrl) {
            this.logger.error("CostTracker initialized without a valid apiBaseUrl. Price fetching will likely fail.");
            this.apiBaseUrl = '';
        } else {
            this.apiBaseUrl = config.apiBaseUrl;
        }
        this.logger.debug(`Using API base URL for /models: ${this.apiBaseUrl}`);

        if (config.initialModelPrices) {
            this.logger.log('Initializing with provided model prices.');
            this.updatePriceCache(config.initialModelPrices);
            this.initialPricesProvided = true;
        }

        if (!this.initialPricesProvided && this.apiBaseUrl) {
            this.fetchModelPrices().catch(err => {
                this.logger.error('Initial model price fetch failed.');
            });
        } else if (!this.apiBaseUrl) {
             this.logger.warn('Skipping initial price fetch due to missing apiBaseUrl.');
        }

        this.startPriceRefreshTimer();
    }

    public async fetchModelPrices(): Promise<void> {
        if (this.isFetchingPrices) {
            this.logger.debug('Price fetch already in progress, skipping.');
            return;
        }
        if (!this.apiBaseUrl) {
             this.logger.error("Cannot fetch model prices: apiBaseUrl is not configured.");
             return;
        }

        this.isFetchingPrices = true;
        this.logger.log('Fetching model prices from API...');

        try {
            const modelsUrl = `${this.apiBaseUrl}${MODELS_API_PATH}`;
            this.logger.debug(`Requesting models from: ${modelsUrl}`);

            // Use the axiosInstance provided (or switch to ApiHandler.getModels() later)
            const response = await this.axiosInstance.get(modelsUrl, {
                baseURL: '' // Treat modelsUrl as absolute
            });

            if (response.status === 200 && response.data?.data) {
                const models = response.data.data as any[];
                const prices: Record<string, ModelPricingInfo> = {};
                let count = 0;
                models.forEach(model => {
                    if (model.id && model.pricing) {
                        const promptCost = parseFloat(model.pricing.prompt);
                        const completionCost = parseFloat(model.pricing.completion);
                        const requestCost = parseFloat(model.pricing.request || '0');

                        if (!isNaN(promptCost) && !isNaN(completionCost) && !isNaN(requestCost)) {
                            prices[model.id] = {
                                id: model.id,
                                name: model.name,
                                promptCostPerMillion: promptCost * 1_000_000,
                                completionCostPerMillion: completionCost * 1_000_000,
                                context_length: model.context_length,
                            };
                            count++;
                        } else {
                             this.logger.warn(`Could not parse pricing for model ${model.id}:`, model.pricing);
                        }
                    }
                });
                this.updatePriceCache(prices);
                this.logger.log(`Successfully fetched and updated prices for ${count} models.`);
            } else {
                throw new APIError(`Failed to fetch model prices: Status ${response.status}`, response.status, response.data);
            }
        } catch (error) {
            const mappedError = mapError(error);
            this.logger.error(`Error fetching model prices: ${mappedError.message}`, mappedError.details);
        } finally {
            this.isFetchingPrices = false;
        }
    }

    private updatePriceCache(prices: Record<string, ModelPricingInfo>): void {
        const newCache = new Map<string, ModelPricingInfo>();
        for (const modelId in prices) {
            if (Object.prototype.hasOwnProperty.call(prices, modelId)) {
                newCache.set(modelId, prices[modelId]);
            }
        }
        this.priceCache = newCache;
        this.logger.debug(`Price cache updated with ${newCache.size} entries.`);
    }

    public calculateCost(modelId: string, usage: UsageInfo | null | undefined): number | null {
        if (!usage) {
            this.logger.debug(`Cannot calculate cost for ${modelId}: usage info missing.`);
            return null;
        }
        if (typeof modelId !== 'string' || !modelId) {
             this.logger.warn(`Cannot calculate cost: invalid modelId provided.`);
             return null;
        }

        const prices = this.priceCache.get(modelId);
        if (!prices) {
            this.logger.warn(`Cannot calculate cost for ${modelId}: price info not found in cache.`);
            // Consider attempting a price fetch here if cache is empty?
            // if (this.priceCache.size === 0 && !this.isFetchingPrices) {
            //     this.fetchModelPrices(); // Fire and forget?
            // }
            return null;
        }

        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;

        const promptCost = (promptTokens / 1_000_000) * prices.promptCostPerMillion;
        const completionCost = (completionTokens / 1_000_000) * prices.completionCostPerMillion;

        const totalCost = promptCost + completionCost;

        this.logger.debug(`Calculated cost for ${modelId}: $${totalCost.toFixed(8)} (Prompt: ${promptTokens} tokens, Completion: ${completionTokens} tokens)`);
        return totalCost;
    }

    public getModelPrice(modelId: string): ModelPricingInfo | undefined {
        return this.priceCache.get(modelId);
    }

    public getAllModelPrices(): Record<string, ModelPricingInfo> {
        return Object.fromEntries(this.priceCache);
    }

    private startPriceRefreshTimer(): void {
        this.stopPriceRefreshTimer();
        if (this.refreshIntervalMs > 0 && this.apiBaseUrl) {
            this.logger.log(`Starting price refresh timer with interval: ${this.refreshIntervalMs} ms`);
            this.refreshTimer = setInterval(() => {
                this.fetchModelPrices().catch(err => {
                    this.logger.error('Scheduled model price refresh failed unexpectedly inside setInterval:', err.message);
                });
            }, this.refreshIntervalMs);
            if (this.refreshTimer?.unref) {
                this.refreshTimer.unref();
            }
        } else if (this.refreshIntervalMs <= 0) {
             this.logger.log('Price refresh timer disabled (interval <= 0).');
        } else {
             this.logger.warn('Price refresh timer not started (apiBaseUrl missing).');
        }
    }

    public stopPriceRefreshTimer(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            this.logger.log('Price refresh timer stopped.');
        }
    }

    public destroy(): void {
        this.stopPriceRefreshTimer();
        this.priceCache.clear();
        this.logger.log('CostTracker destroyed.');
    }
}