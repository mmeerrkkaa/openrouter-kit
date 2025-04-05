import type { OpenRouterPlugin } from '../types';
import type { OpenRouterClient } from '../client';
import { CostTracker } from '../cost-tracker';

/**
 * Example plugin that replaces CostTracker with an extended version.
 * In real use, this could push usage data to billing service.
 */
export function createBillingCostTrackerPlugin(): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      class BillingCostTracker extends CostTracker {
        override calculateCost(modelId: string, usage: any): number | null {
          const cost = super.calculateCost(modelId, usage);
          // Optionally, send cost info to billing API here
          return cost;
        }
      }

      const existing = client.getCostTracker();
      if (!existing) {
        client['logger']?.warn?.('No existing CostTracker to extend');
        return;
      }

      const billingTracker = new BillingCostTracker(
        existing['axiosInstance'],
        existing['logger'],
        {
          enableCostTracking: true,
          priceRefreshIntervalMs: 6 * 60 * 60 * 1000,
          initialModelPrices: existing.getAllModelPrices(),
          apiBaseUrl: '' // Set if needed
        }
      );

      client.setCostTracker(billingTracker);
      client['logger']?.log?.('Billing CostTracker plugin initialized');
    }
  };
}