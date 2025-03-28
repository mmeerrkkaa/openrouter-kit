// Path: security/types.ts
import {
  Tool,
  UserAuthInfo as BaseUserAuthInfo,
  SecurityConfig as BaseSecurityConfig,
  ToolCallEvent as BaseToolCallEvent,
  RateLimit as BaseRateLimit,
  DangerousArgumentsConfig as BaseDangerousArgumentsConfig,
} from '../types';
import type { Logger } from '../utils/logger';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter'; 

export interface ExtendedRateLimit extends BaseRateLimit {
  interval?: string | number;
}
export type RateLimit = ExtendedRateLimit;

export type UserAuthInfo = BaseUserAuthInfo & {
  username?: string;
  roles?: string[];
  permissions?: string[];
  metadata?: Record<string, any>;
};

export type DangerousArgumentsConfig = BaseDangerousArgumentsConfig & {
    extendablePatterns?: Array<string | RegExp>;
    auditOnlyMode?: boolean;
    specificKeyRules?: Record<string, any>;
};

export type SecurityConfig = BaseSecurityConfig & {
  debug?: boolean;
  allowUnauthenticatedAccess?: boolean;
  dangerousArguments?: DangerousArgumentsConfig; 
  toolConfig?: Record<string, {
      dangerousPatterns?: Array<string | RegExp>;
  }>;
};

export interface SecurityContext {
  config: SecurityConfig;
  debug: boolean;
  userId?: string;
  toolName?: string;
}

export interface ISecurityManager {
  getConfig(): SecurityConfig;
  updateConfig(config: Partial<SecurityConfig>): void;
  authenticateUser(accessToken?: string): Promise<UserAuthInfo | null>;
  createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn?: string | number): string;
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

export interface SecurityCheckParams {
  tool: Tool;
  userInfo: UserAuthInfo | null;
  args?: any;
  context: SecurityContext;
  securityManager?: ISecurityManager;
}

export interface SecurityCheck {
  validate(params: SecurityCheckParams): Promise<void> | void;
}

export interface TokenValidationResult {
  isValid: boolean;
  userInfo?: UserAuthInfo;
  error?: Error;
}

export interface TokenConfig {
  payload: Omit<UserAuthInfo, 'expiresAt'>;
  expiresIn?: string | number;
}

export interface RateLimitParams {
  userId: string;
  toolName: string;
  rateLimit: RateLimit;
  source?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetTime: Date;
  timeLeft?: number;
}

export interface IAuthManager {
  authenticateUser(accessToken?: string): Promise<UserAuthInfo | null>;
  createAccessToken(config: TokenConfig): string;
  validateToken(token: string): Promise<TokenValidationResult>;
  clearTokenCache(): void;
  setDebugMode(debug: boolean): void;
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
  validateArguments(tool: Tool, args: any, context: SecurityContext): Promise<void>;
  setDebugMode(debug: boolean): void;
  destroy?(): void;
}

// Re-export SimpleEventEmitter under the old name for compatibility if needed,
// or preferably update all usages. Here we assume usages are updated.
// We remove the ISecurityEventEmitter interface completely.

export interface ExtendedToolCallEvent extends BaseToolCallEvent {
  duration?: number;
}

export interface ISecurityLogger extends Logger {
  logToolCall(event: ExtendedToolCallEvent): void;
}