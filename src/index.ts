// Path: src/index.ts

// --- Core Client ---
export { OpenRouterClient } from './client';

// --- Configuration & Constants ---
export * as config from './config';

// --- Core Types ---
export * from './types';

// --- Streaming Types (explicit export for better visibility) ---
export type { StreamChunk, StreamCallbacks, ChatStreamResult } from './types';

// --- Error Handling ---
export * from './utils/error';

// --- Utilities ---
export * as utils from './utils';
export { Logger } from './utils/logger';
export { SimpleEventEmitter } from './utils/simple-event-emitter';

// --- Tool Handling ---
export { ToolHandler } from './tool-handler';

// --- History Management ---
export { UnifiedHistoryManager } from './history/unified-history-manager';
export { HistoryAnalyzer } from './history/history-analyzer'; // Ensure export
export type { HistoryQueryOptions, HistoryStats, TimeSeriesDataPoint, TimeSeriesData } from './history/history-analyzer'; // Ensure export
// Export built-in Storage Adapters
export { MemoryHistoryStorage } from './history/memory-storage';
export { DiskHistoryStorage } from './history/disk-storage';
// Export History Plugins
export { createRedisHistoryPlugin } from './history/redis-history-plugin';

// --- Security Module ---
export { SecurityManager } from './security/security-manager';
export { createDefaultSecurityManager } from './security/index';
export { AuthManager } from './security/auth-manager';
export { AccessControlManager } from './security/access-control-manager';
export { RateLimitManager } from './security/rate-limit-manager';
export { ArgumentSanitizer } from './security/argument-sanitizer';

export type {
    ISecurityManager,
    IAuthManager,
    IAccessControlManager,
    IRateLimitManager,
    IArgumentSanitizer,
    ExtendedRateLimit,
    ExtendedUserAuthInfo,
    ExtendedDangerousArgumentsConfig,
    ExtendedSecurityConfig,
    SecurityContext,
    SecurityCheckParams,
    TokenValidationResult,
    TokenConfig,
    RateLimitParams,
    RateLimitResult,
    ExtendedToolCallEvent
} from './security/types';

// --- General Plugins ---
export { createBillingCostTrackerPlugin } from './plugins/billing-cost-tracker-plugin';
export { createCustomToolRegistryPlugin } from './plugins/custom-tool-registry-plugin';
export { createExternalSecurityPlugin } from './plugins/external-security-plugin';
export { createLoggingMiddlewarePlugin } from './plugins/logging-middleware-plugin';

// --- Cost Tracking ---
export { CostTracker } from './cost-tracker';

// --- Core Components (Optional Export) ---
// export { ApiHandler } from './core/api-handler';
// export { ChatProcessor } from './core/chat-processor';
// export { PluginManager } from './core/plugin-manager';
// export * from './core/message-preparer';