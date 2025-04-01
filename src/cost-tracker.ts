// Path: src/cost-tracker.ts
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from './utils/logger';
import { ModelPricingInfo, UsageInfo, OpenRouterConfig } from './types';
import { mapError, APIError, NetworkError } from './utils/error';

const DEFAULT_PRICE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MODELS_API_PATH = '/models'; // Path relative to base API URL

export class CostTracker {
    private priceCache: Map<string, ModelPricingInfo> = new Map();
    private axiosInstance: AxiosInstance;
    private logger: Logger;
    private refreshIntervalMs: number;
    private refreshTimer: NodeJS.Timeout | null = null;
    private isFetchingPrices: boolean = false;
    private initialPricesProvided: boolean = false;
    private apiBaseUrl: string; // Store the base URL for the /models endpoint

    constructor(
        axiosInstance: AxiosInstance,
        logger: Logger,
        config: Pick<OpenRouterConfig, 'enableCostTracking' | 'priceRefreshIntervalMs' | 'initialModelPrices'> & { apiBaseUrl: string }
    ) {
        this.axiosInstance = axiosInstance;
        this.logger = logger.withPrefix('CostTracker');
        this.refreshIntervalMs = config.priceRefreshIntervalMs ?? DEFAULT_PRICE_REFRESH_INTERVAL_MS;
        this.apiBaseUrl = config.apiBaseUrl; // Use the base URL passed from the client
        this.logger.debug(`Using API base URL for /models: ${this.apiBaseUrl}`);

        if (config.initialModelPrices) {
            this.logger.log('Initializing with provided model prices.');
            this.updatePriceCache(config.initialModelPrices);
            this.initialPricesProvided = true;
        }

        if (!this.initialPricesProvided) {
            this.fetchModelPrices().catch(err => {
                this.logger.error('Initial model price fetch failed:', err.message);
            });
        }

        this.startPriceRefreshTimer();
    }

    public async fetchModelPrices(): Promise<void> {
        if (this.isFetchingPrices) {
            this.logger.debug('Price fetch already in progress, skipping.');
            return;
        }
        this.isFetchingPrices = true;
        this.logger.log('Fetching model prices from API...');

        try {
            const modelsUrl = `${this.apiBaseUrl}${MODELS_API_PATH}`; // Construct URL from the correct base
            this.logger.debug(`Requesting models from: ${modelsUrl}`);

            // Use the full URL in the get request, overriding any default baseURL from the instance
            const response = await this.axiosInstance.get(modelsUrl, {
                baseURL: undefined // Ensure the provided modelsUrl is treated as absolute
            });

            if (response.status === 200 && response.data?.data) {
                const models = response.data.data as any[];
                const prices: Record<string, ModelPricingInfo> = {};
                let count = 0;
                models.forEach(model => {
                    if (model.id && model.pricing) {
                        const promptCost = parseFloat(model.pricing.prompt);
                        const completionCost = parseFloat(model.pricing.completion);

                        if (!isNaN(promptCost) && !isNaN(completionCost)) {
                            prices[model.id] = {
                                id: model.id,
                                name: model.name,
                                promptCostPerMillion: promptCost * 1_000_000,
                                completionCostPerMillion: completionCost * 1_000_000,
                                context_length: model.context_length
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

        const prices = this.priceCache.get(modelId);
        if (!prices) {
            this.logger.warn(`Cannot calculate cost for ${modelId}: price info not found in cache.`);
            return null;
        }

        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;

        const promptCost = (promptTokens / 1_000_000) * prices.promptCostPerMillion;
        const completionCost = (completionTokens / 1_000_000) * prices.completionCostPerMillion;

        const totalCost = promptCost + completionCost;

        this.logger.debug(`Calculated cost for ${modelId}: $${totalCost.toFixed(6)} (Prompt: ${promptTokens} tokens, Completion: ${completionTokens} tokens)`);
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
        if (this.refreshIntervalMs > 0) {
            this.logger.log(`Starting price refresh timer with interval: ${this.refreshIntervalMs} ms`);
            this.refreshTimer = setInterval(() => {
                this.fetchModelPrices().catch(err => {
                    this.logger.error('Scheduled model price refresh failed:', err.message);
                });
            }, this.refreshIntervalMs);
            if (this.refreshTimer?.unref) {
                this.refreshTimer.unref();
            }
        } else {
             this.logger.log('Price refresh timer disabled (interval <= 0).');
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