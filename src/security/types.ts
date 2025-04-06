// Path: src/security/types.ts
import {
  Tool as BaseTool,
  UserAuthInfo as BaseUserAuthInfo,
  SecurityConfig as BaseSecurityConfig,
  ToolCallEvent as BaseToolCallEvent,
  RateLimit as BaseRateLimit,
  DangerousArgumentsConfig as BaseDangerousArgumentsConfig,
  UserAuthConfig as BaseUserAuthConfig,
  ToolAccessConfig as BaseToolAccessConfig,
  RoleConfig as BaseRoleConfig,
} from '../types';
import type { Logger } from '../utils/logger';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

// --- Extended/Specific Types for Security Module ---

// Rename RateLimit to avoid conflict with base type
export interface ExtendedRateLimit extends BaseRateLimit {
  interval?: string | number;
}
// Use the extended type within the security module where interval is needed
// Base RateLimit is still available via import from '../types' if needed elsewhere

// Rename UserAuthInfo to avoid conflict with base type
export type ExtendedUserAuthInfo = BaseUserAuthInfo & {
  username?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
};

// Rename DangerousArgumentsConfig to avoid conflict with base type
export type ExtendedDangerousArgumentsConfig = BaseDangerousArgumentsConfig & {
    extendablePatterns?: Array<string | RegExp>;
    auditOnlyMode?: boolean;
    specificKeyRules?: Record<string, any>;
};

// Re-export base types that are used directly by security interfaces but not extended
export type UserAuthConfig = BaseUserAuthConfig;
export type ToolAccessConfig = BaseToolAccessConfig;
export type RoleConfig = BaseRoleConfig;

// Rename SecurityConfig to avoid conflict with base type
export type ExtendedSecurityConfig = BaseSecurityConfig & {
  debug: boolean; // Make debug required
  allowUnauthenticatedAccess?: boolean;
  dangerousArguments?: ExtendedDangerousArgumentsConfig; // Use extended type
  toolConfig?: Record<string, {
      dangerousPatterns?: Array<string | RegExp>;
  }>;
};

export interface SecurityContext {
  config: ExtendedSecurityConfig; // Use extended SecurityConfig
  debug: boolean;
  userId?: string;
  toolName?: string;
}

// --- Interfaces for Security Components ---

export interface ISecurityManager {
  getConfig(): ExtendedSecurityConfig; // Use extended SecurityConfig
  updateConfig(config: Partial<ExtendedSecurityConfig>): void; // Use extended SecurityConfig
  authenticateUser(accessToken?: string): Promise<ExtendedUserAuthInfo | null>; // Use extended UserAuthInfo
  createAccessToken(userInfo: Omit<ExtendedUserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string; // Use extended UserAuthInfo
  checkToolAccessAndArgs(tool: BaseTool, userInfo: ExtendedUserAuthInfo | null, args?: any): Promise<boolean>; // Use BaseTool, extended UserAuthInfo
  logToolCall(event: ExtendedToolCallEvent): void;
  isDebugEnabled(): boolean;
  setDebugMode(debug: boolean): void;
  on(event: string, handler: (event: any) => void): ISecurityManager;
  off(event: string, handler: (event: any) => void): ISecurityManager;
  clearTokenCache(): void;
  clearRateLimitCounters(userId?: string): void;
  destroy?(): void;
}

export interface SecurityCheckParams {
  tool: BaseTool;
  userInfo: ExtendedUserAuthInfo | null; // Use extended UserAuthInfo
  args?: any;
  context: SecurityContext;
  securityManager?: ISecurityManager;
}

export interface TokenValidationResult {
  isValid: boolean;
  userInfo?: ExtendedUserAuthInfo; // Use extended UserAuthInfo
  error?: Error;
}

export interface TokenConfig {
  payload: Omit<ExtendedUserAuthInfo, 'expiresAt'>; // Use extended UserAuthInfo
  expiresIn?: string | number;
}

export interface RateLimitParams {
  userId: string;
  toolName: string;
  rateLimit: ExtendedRateLimit; // Use extended RateLimit
  source?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetTime: Date;
  timeLeft?: number;
}

// --- Interfaces for Sub-Managers ---

export interface IAuthManager {
  authenticateUser(accessToken?: string): Promise<ExtendedUserAuthInfo | null>; // Use extended UserAuthInfo
  createAccessToken(config: TokenConfig): string;
  validateToken(token: string): Promise<TokenValidationResult>;
  clearTokenCache(): void;
  setDebugMode(debug: boolean): void;
  updateSecret?(newSecret: string | undefined): void;
  destroy?(): void;
}

export interface IAccessControlManager {
  checkAccess(params: SecurityCheckParams): Promise<boolean>;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

export interface IRateLimitManager {
  checkRateLimit(params: RateLimitParams): RateLimitResult;
  clearLimits(userId?: string): void;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

export interface IArgumentSanitizer {
  validateArguments(tool: BaseTool, args: any, context: SecurityContext): Promise<void>;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

// --- Event Payloads ---

export interface ExtendedToolCallEvent extends BaseToolCallEvent {
  duration?: number;
}