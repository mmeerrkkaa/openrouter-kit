// Path: src/cost-tracker.ts
import { AxiosInstance } from 'axios'; // Removed AxiosRequestConfig as it's not directly used here
import { Logger } from './utils/logger';
import { ModelPricingInfo, UsageInfo, OpenRouterConfig } from './types';
import { mapError, APIError } from './utils/error'; // Removed NetworkError as less likely here

const DEFAULT_PRICE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MODELS_API_PATH = '/models'; // Path relative to base API URL passed from client

export class CostTracker {
    private priceCache: Map<string, ModelPricingInfo> = new Map();
    private axiosInstance: AxiosInstance; // Used for making requests
    private logger: Logger;
    private refreshIntervalMs: number;
    private refreshTimer: NodeJS.Timeout | null = null;
    private isFetchingPrices: boolean = false;
    private initialPricesProvided: boolean = false;
    private apiBaseUrl: string; // Store the base URL for the /models endpoint

    constructor(
        axiosInstance: AxiosInstance,
        logger: Logger,
        // Use Pick<> for relevant config fields + the mandatory apiBaseUrl
        config: Pick<OpenRouterConfig, 'enableCostTracking' | 'priceRefreshIntervalMs' | 'initialModelPrices'> & { apiBaseUrl: string }
    ) {
        this.axiosInstance = axiosInstance;
        this.logger = logger.withPrefix('CostTracker');
        this.refreshIntervalMs = config.priceRefreshIntervalMs ?? DEFAULT_PRICE_REFRESH_INTERVAL_MS;
        // Ensure apiBaseUrl is correctly received and stored
        if (!config.apiBaseUrl) {
            this.logger.error("CostTracker initialized without a valid apiBaseUrl. Price fetching will likely fail.");
            // Defaulting might hide the issue, better to proceed and let it fail predictably.
            this.apiBaseUrl = ''; // Or throw an error?
        } else {
            this.apiBaseUrl = config.apiBaseUrl;
        }
        this.logger.debug(`Using API base URL for /models: ${this.apiBaseUrl}`);

        if (config.initialModelPrices) {
            this.logger.log('Initializing with provided model prices.');
            this.updatePriceCache(config.initialModelPrices);
            this.initialPricesProvided = true;
        }

        // Fetch prices immediately only if no initial prices were given
        if (!this.initialPricesProvided && this.apiBaseUrl) {
            this.fetchModelPrices().catch(err => {
                // Error is already logged within fetchModelPrices
                this.logger.error('Initial model price fetch failed.');
            });
        } else if (!this.apiBaseUrl) {
             this.logger.warn('Skipping initial price fetch due to missing apiBaseUrl.');
        }

        // Start the timer regardless of initial fetch success
        this.startPriceRefreshTimer();
    }

    public async fetchModelPrices(): Promise<void> {
        if (this.isFetchingPrices) {
            this.logger.debug('Price fetch already in progress, skipping.');
            return;
        }
        // Check if apiBaseUrl is valid before attempting fetch
        if (!this.apiBaseUrl) {
             this.logger.error("Cannot fetch model prices: apiBaseUrl is not configured.");
             return;
        }

        this.isFetchingPrices = true;
        this.logger.log('Fetching model prices from API...');

        try {
            const modelsUrl = `${this.apiBaseUrl}${MODELS_API_PATH}`; // Construct full URL
            this.logger.debug(`Requesting models from: ${modelsUrl}`);

            // Use the axiosInstance provided by the client (includes auth headers)
            // Override baseURL to ensure the correct absolute URL is used
            const response = await this.axiosInstance.get(modelsUrl, {
                baseURL: '' // Treat modelsUrl as absolute
            });

            if (response.status === 200 && response.data?.data) {
                const models = response.data.data as any[];
                const prices: Record<string, ModelPricingInfo> = {};
                let count = 0;
                models.forEach(model => {
                    if (model.id && model.pricing) {
                        // Use parseFloat for robustness against string numbers
                        const promptCost = parseFloat(model.pricing.prompt);
                        const completionCost = parseFloat(model.pricing.completion);
                        const requestCost = parseFloat(model.pricing.request || '0'); // Handle optional request cost

                        // Check if costs are valid numbers
                        if (!isNaN(promptCost) && !isNaN(completionCost) && !isNaN(requestCost)) {
                            prices[model.id] = {
                                id: model.id,
                                name: model.name,
                                // Prices from API are per token, convert to per million tokens
                                promptCostPerMillion: promptCost * 1_000_000,
                                completionCostPerMillion: completionCost * 1_000_000,
                                // Store other potentially useful info
                                context_length: model.context_length,
                                // requestCost is usually per request, store it as is (or convert if needed)
                                // For now, let's ignore requestCost in calculateCost unless needed
                            };
                            count++;
                        } else {
                             // Log which model had parsing issues
                             this.logger.warn(`Could not parse pricing for model ${model.id}:`, model.pricing);
                        }
                    }
                });
                this.updatePriceCache(prices);
                this.logger.log(`Successfully fetched and updated prices for ${count} models.`);
            } else {
                // Throw APIError for non-200 status or missing data
                throw new APIError(`Failed to fetch model prices: Status ${response.status}`, response.status, response.data);
            }
        } catch (error) {
            // Map any error (network, API error, etc.)
            const mappedError = mapError(error);
            this.logger.error(`Error fetching model prices: ${mappedError.message}`, mappedError.details);
            // Do not re-throw here, allow the timer/initial fetch to fail silently after logging
        } finally {
            this.isFetchingPrices = false;
        }
    }

    private updatePriceCache(prices: Record<string, ModelPricingInfo>): void {
        const newCache = new Map<string, ModelPricingInfo>();
        for (const modelId in prices) {
            // Ensure it's a direct property (not from prototype)
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
        // Ensure modelId is a string and not empty
        if (typeof modelId !== 'string' || !modelId) {
             this.logger.warn(`Cannot calculate cost: invalid modelId provided.`);
             return null;
        }

        const prices = this.priceCache.get(modelId);
        if (!prices) {
            // Log if prices are missing, maybe trigger a fetch? For now, just warn.
            this.logger.warn(`Cannot calculate cost for ${modelId}: price info not found in cache.`);
            // Consider attempting a price fetch here if cache is empty?
            // if (this.priceCache.size === 0) {
            //     this.fetchModelPrices(); // Fire and forget?
            // }
            return null;
        }

        const promptTokens = usage.prompt_tokens || 0;
        const completionTokens = usage.completion_tokens || 0;

        // Calculate cost based on millions of tokens
        const promptCost = (promptTokens / 1_000_000) * prices.promptCostPerMillion;
        const completionCost = (completionTokens / 1_000_000) * prices.completionCostPerMillion;

        // Add request cost if available and relevant (currently ignored)
        // const requestCost = prices.requestCost || 0;

        const totalCost = promptCost + completionCost; // + requestCost;

        this.logger.debug(`Calculated cost for ${modelId}: $${totalCost.toFixed(8)} (Prompt: ${promptTokens} tokens, Completion: ${completionTokens} tokens)`);
        return totalCost;
    }

    public getModelPrice(modelId: string): ModelPricingInfo | undefined {
        return this.priceCache.get(modelId);
    }

    public getAllModelPrices(): Record<string, ModelPricingInfo> {
        // Convert Map to plain object for external use
        return Object.fromEntries(this.priceCache);
    }

    private startPriceRefreshTimer(): void {
        this.stopPriceRefreshTimer(); // Clear existing timer first
        // Only start if interval is positive and we have a base URL
        if (this.refreshIntervalMs > 0 && this.apiBaseUrl) {
            this.logger.log(`Starting price refresh timer with interval: ${this.refreshIntervalMs} ms`);
            this.refreshTimer = setInterval(() => {
                // Don't let errors in fetch stop the timer
                this.fetchModelPrices().catch(err => {
                    this.logger.error('Scheduled model price refresh failed unexpectedly inside setInterval:', err.message);
                });
            }, this.refreshIntervalMs);
            // Allow Node.js to exit even if the timer is active
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
        this.stopPriceRefreshTimer(); // Stop timer
        this.priceCache.clear(); // Clear cache
        this.logger.log('CostTracker destroyed.');
        // Nullify axiosInstance reference? Not typically necessary unless managing external resources.
        // this.axiosInstance = null;
    }
}