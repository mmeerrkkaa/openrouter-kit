# Changelog

## Feature/Library-Improvements (Current)

### Added
- New `CostTracker` module for tracking API usage costs
  - Automatically fetches model pricing from OpenRouter API
  - Calculates costs for each request based on token usage
  - Configurable price refresh interval
  - Support for manually providing model prices

### Enhanced
- Extended `OpenRouterConfig` interface with cost tracking options
  - `enableCostTracking`: Toggle cost tracking functionality
  - `priceRefreshIntervalMs`: Configure how often to refresh pricing data
  - `initialModelPrices`: Provide initial prices to avoid API call

### Modified
- Improved client configuration and initialization
- Enhanced error handling and type definitions
- Updated JSON utilities and response handling 