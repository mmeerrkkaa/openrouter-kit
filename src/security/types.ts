// Path: security/types.ts
/**
 * Types and interfaces for the security module (`SecurityManager` and its components).
 * Extends base types from `../types`.
 */

import {
  Tool,
  UserAuthInfo as BaseUserAuthInfo,
  SecurityConfig as BaseSecurityConfig,
  ToolCallEvent as BaseToolCallEvent,
  RateLimit as BaseRateLimit,
} from '../types';
import type { Logger } from '../utils/logger';

/**
 * Extended interface for RateLimit, adding `interval`.
 */
export interface ExtendedRateLimit extends BaseRateLimit {
  interval?: string | number;
  /** @deprecated */
  maxRequests?: number;
}
export type RateLimit = ExtendedRateLimit;

// Define UserAuthInfo as an intersection of the base type and extended fields
export type UserAuthInfo = BaseUserAuthInfo & {
  username?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
};

// Define SecurityConfig as an intersection of the base type and extended fields
export type SecurityConfig = BaseSecurityConfig & {
  debug?: boolean;
  allowUnauthenticatedAccess?: boolean;
  /** @deprecated */
  defaultToolAccess?: boolean;
  dangerousArguments?: {
      globalPatterns?: RegExp[];
      toolSpecificPatterns?: Record<string, RegExp[]>;
      blockedValues?: string[];
      specificKeyRules?: Record<string, any>;
  };
  toolConfig?: Record<string, {
      dangerousPatterns?: Array<string | RegExp>;
  }>;
};

// --- Component Interfaces ---

/**
 * Context passed between security components during checks.
 */
export interface SecurityContext {
  config: SecurityConfig;
  debug: boolean;
  userId?: string;
  toolName?: string;
}

/**
 * Main interface for the security manager.
 * Coordinates all security components.
 */
export interface ISecurityManager {
  getConfig(): SecurityConfig;
  updateConfig(config: Partial<SecurityConfig>): void;
  authenticateUser(accessToken?: string): Promise<UserAuthInfo | null>;
  createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string; // Updated expiresIn type
  checkToolAccessAndArgs(tool: Tool, userInfo: UserAuthInfo | null, args?: any): Promise<boolean>;
  logToolCall(event: ExtendedToolCallEvent): void;
  isDebugEnabled(): boolean;
  setDebugMode(debug: boolean): void;
  on(event: string, handler: (event: any) => void): ISecurityManager;
  off(event: string, handler: (event: any) => void): ISecurityManager;
  clearTokenCache(): void;
  clearRateLimitCounters(userId?: string): void;
  destroy?(): void;
}


/**
 * Parameters for comprehensive access and argument checks.
 */
export interface SecurityCheckParams {
  tool: Tool;
  userInfo: UserAuthInfo | null;
  args?: any;
  context: SecurityContext;
  securityManager?: ISecurityManager; // Now refers to the locally defined interface
}

/**
 * @deprecated Interface not used.
 */
export interface SecurityCheck {
  validate(params: SecurityCheckParams): Promise<void> | void;
}

/**
 * Result of JWT token validation.
 */
export interface TokenValidationResult {
  isValid: boolean;
  userInfo?: UserAuthInfo;
  error?: Error;
}

/**
 * Configuration for creating a JWT token.
 */
export interface TokenConfig {
  payload: Omit<UserAuthInfo, 'expiresAt'>;
  // --- UPDATED HERE ---
  expiresIn?: string | number; // Allow string ('1h') or number (seconds)
  // --- END OF UPDATE ---
}

/**
 * Parameters for Rate Limit check.
 */
export interface RateLimitParams {
  userId: string;
  toolName: string;
  rateLimit: RateLimit;
  source?: string;
}

/**
 * Result of Rate Limit check.
 */
export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetTime: Date;
  timeLeft?: number;
}

/**
 * Interface for the AuthManager component.
 */
export interface IAuthManager {
  authenticateUser(accessToken?: string): Promise<UserAuthInfo | null>;
  createAccessToken(config: TokenConfig): string; // Uses the updated TokenConfig
  validateToken(token: string): Promise<TokenValidationResult>;
  clearTokenCache(): void;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

/**
 * Interface for the AccessControlManager component.
 */
export interface IAccessControlManager {
  checkAccess(params: SecurityCheckParams): Promise<boolean>;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

/**
 * Interface for the RateLimitManager component.
 */
export interface IRateLimitManager {
  checkRateLimit(params: RateLimitParams): RateLimitResult;
  clearLimits(userId?: string): void;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

/**
 * Interface for the ArgumentSanitizer component.
 */
export interface IArgumentSanitizer {
  validateArguments(tool: Tool, args: any, context: SecurityContext): Promise<void>;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

/**
 * Interface for the security Event Emitter.
 */
export interface ISecurityEventEmitter {
  on(event: string, handler: (event: any) => void): void;
  off(event: string, handler: (event: any) => void): void;
  emit(event: string, data: any): void;
  removeAllListeners?(event?: string): void;
}

/**
 * Extended interface for the tool call event.
 */
export interface ExtendedToolCallEvent extends BaseToolCallEvent {
  duration?: number;
}

/**
 * @deprecated Interface not used.
 */
export interface ISecurityLogger extends Logger {
  logToolCall(event: ExtendedToolCallEvent): void;
}