// Path: src/index.ts

// --- Core Client ---
export { OpenRouterClient } from './client';
// Default export removed as it caused issues and named export is standard
// export { default as default } from './client';

// --- Configuration & Constants ---
export * as config from './config';

// --- Core Types ---
// Export all base types from the main types file
export * from './types';

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
// Export built-in Storage Adapters
export { MemoryHistoryStorage } from './history/memory-storage';
export { DiskHistoryStorage } from './history/disk-storage';
// Export History Plugins
export { createRedisHistoryPlugin } from './history/redis-history-plugin';

// --- Security Module ---
export { SecurityManager } from './security/security-manager';
export { createDefaultSecurityManager } from './security/index';
// Export security sub-components if direct use is intended
export { AuthManager } from './security/auth-manager';
export { AccessControlManager } from './security/access-control-manager';
export { RateLimitManager } from './security/rate-limit-manager';
export { ArgumentSanitizer } from './security/argument-sanitizer';

// Export necessary interfaces and extended types from security/types explicitly
export type {
    // Interfaces
    ISecurityManager,
    IAuthManager,
    IAccessControlManager,
    IRateLimitManager,
    IArgumentSanitizer,
    // Extended Types (using their new names)
    ExtendedRateLimit,
    ExtendedUserAuthInfo,
    ExtendedDangerousArgumentsConfig,
    ExtendedSecurityConfig,
    // Other Security Types
    SecurityContext,
    SecurityCheckParams,
    TokenValidationResult,
    TokenConfig,
    RateLimitParams,
    RateLimitResult,
    ExtendedToolCallEvent
} from './security/types';
// Note: Base types like UserAuthConfig, ToolAccessConfig, RoleConfig are exported via `export * from './types'`

// --- General Plugins ---
export { createBillingCostTrackerPlugin } from './plugins/billing-cost-tracker-plugin';
export { createCustomToolRegistryPlugin } from './plugins/custom-tool-registry-plugin';
export { createExternalSecurityPlugin } from './plugins/external-security-plugin';
export { createLoggingMiddlewarePlugin } from './plugins/logging-middleware-plugin';

// --- Cost Tracking ---
export { CostTracker } from './cost-tracker';