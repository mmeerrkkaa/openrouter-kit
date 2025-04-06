// Path: src/security/security-manager.ts
import {
  ISecurityManager,
  SecurityCheckParams,
  SecurityContext,
  ExtendedToolCallEvent,
  ExtendedSecurityConfig, // Use renamed type
  ExtendedUserAuthInfo,   // Use renamed type
  IAuthManager,
  IAccessControlManager,
  IRateLimitManager,
  IArgumentSanitizer,
  ExtendedRateLimit, // Use renamed type
  UserAuthConfig
} from './types';
import { SimpleEventEmitter } from '../utils/simple-event-emitter';
import { AuthManager } from './auth-manager';
import { RateLimitManager } from './rate-limit-manager';
import { AccessControlManager } from './access-control-manager';
import { ArgumentSanitizer } from './argument-sanitizer';
import { Logger } from '../utils/logger';
import { Tool } from '../types'; // Use base Tool type from core
import {
  AccessDeniedError,
  AuthorizationError,
  RateLimitError as ToolRateLimitError,
  SecurityError,
  ConfigError,
  AuthenticationError,
  mapError,
  ErrorCode,
} from '../utils/error';

type SecurityConfig = ExtendedSecurityConfig; // Alias for internal use
type UserAuthInfo = ExtendedUserAuthInfo;     // Alias for internal use
type RateLimit = ExtendedRateLimit;           // Alias for internal use

export class SecurityManager implements ISecurityManager {
  private config: SecurityConfig; // Use the aliased extended type
  private eventEmitter: SimpleEventEmitter;
  private authManager: IAuthManager;
  private rateLimitManager: IRateLimitManager;
  private accessControlManager: IAccessControlManager;
  private argumentSanitizer: IArgumentSanitizer;
  private debug: boolean; // Instance variable type is boolean
  private logger: Logger;
  private _destroyed: boolean = false;

  constructor(config?: Partial<SecurityConfig>, secretKeyOrDebug?: string | boolean) {
    const defaultConfig: SecurityConfig = {
        defaultPolicy: 'deny-all',
        debug: false, // Explicitly boolean
        requireAuthentication: false,
        allowUnauthenticatedAccess: false,
        userAuthentication: { type: 'jwt' },
        dangerousArguments: {
            auditOnlyMode: false
        }
    };

    let mergedConfig = { ...defaultConfig, ...(config || {}) };
    if (config?.userAuthentication) {
        mergedConfig.userAuthentication = { ...defaultConfig.userAuthentication, ...config.userAuthentication };
    }
    if (config?.dangerousArguments) {
        mergedConfig.dangerousArguments = { ...(defaultConfig.dangerousArguments || {}), ...config.dangerousArguments };
    }
     if (config?.roles?.roles) {
         if (!mergedConfig.roles) mergedConfig.roles = {};
         mergedConfig.roles.roles = { ...(defaultConfig.roles?.roles || {}), ...config.roles.roles };
     } else if (config?.roles) {
          mergedConfig.roles = { ...(defaultConfig.roles || {}), ...config.roles };
     }
    if (config?.toolAccess) mergedConfig.toolAccess = { ...(defaultConfig.toolAccess || {}), ...config.toolAccess };
    if (config?.toolConfig) mergedConfig.toolConfig = { ...(defaultConfig.toolConfig || {}), ...config.toolConfig };

    // Ensure debug is boolean after merge
    mergedConfig.debug = typeof mergedConfig.debug === 'boolean' ? mergedConfig.debug : defaultConfig.debug;

    this.config = mergedConfig;

    // Determine final debug state correctly
    let finalDebugValue: boolean;
    if (typeof secretKeyOrDebug === 'boolean') {
        finalDebugValue = secretKeyOrDebug;
    } else {
        // this.config.debug is now guaranteed boolean
        finalDebugValue = this.config.debug;
    }
    this.debug = finalDebugValue;
    this.config.debug = finalDebugValue;


    let initialJwtSecret = this.config.userAuthentication?.jwtSecret;
    if (typeof secretKeyOrDebug === 'string') {
        initialJwtSecret = secretKeyOrDebug;
        if (!this.config.userAuthentication) this.config.userAuthentication = {};
        this.config.userAuthentication.jwtSecret = initialJwtSecret;
    }
    const finalJwtSecret = initialJwtSecret || 'MISSING_SECRET';


    this.logger = new Logger({ debug: this.debug, prefix: 'SecurityManager' });
    this.eventEmitter = new SimpleEventEmitter();

    this.authManager = new AuthManager(this.config.userAuthentication || {}, this.eventEmitter, this.logger.withPrefix('AuthManager'));
    this.rateLimitManager = new RateLimitManager(this.eventEmitter, this.logger.withPrefix('RateLimitManager'));
    this.accessControlManager = new AccessControlManager(this.eventEmitter, this.logger.withPrefix('AccessControlManager'));
    this.argumentSanitizer = new ArgumentSanitizer(this.eventEmitter, this.logger.withPrefix('ArgumentSanitizer'));

    this.setDebugMode(this.debug);

    this.logger.log(`SecurityManager initialized. Debug: ${this.debug}. Default Policy: ${this.config.defaultPolicy}. Auth Type: ${this.config.userAuthentication?.type || 'N/A'}.`);
    if (this.debug) {
      const configToLog = { ...this.config };
      if (configToLog.userAuthentication?.jwtSecret) {
           configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
      }
      this.logger.debug(`Initial configuration:`, configToLog);
    }
  }

  // ... (rest of the SecurityManager methods remain the same) ...
  getConfig(): SecurityConfig { // Return extended type
    return { ...this.config };
  }

  updateConfig(configUpdate: Partial<SecurityConfig>): void { // Accept partial extended type
    this.logger.log('Updating SecurityManager configuration...');
    const oldDebug = this.debug;
    const oldJwtSecret = this.config.userAuthentication?.jwtSecret;

    const updatedConfig = { ...this.config };

    if (configUpdate.userAuthentication) {
        updatedConfig.userAuthentication = { ...(updatedConfig.userAuthentication || {}), ...configUpdate.userAuthentication };
    }
    if (configUpdate.dangerousArguments) {
        updatedConfig.dangerousArguments = { ...(updatedConfig.dangerousArguments || {}), ...configUpdate.dangerousArguments };
    }
    if (configUpdate.roles) {
        updatedConfig.roles = {
             ...(updatedConfig.roles || {}),
             ...configUpdate.roles,
             roles: {
                 ...(updatedConfig.roles?.roles || {}),
                 ...(configUpdate.roles.roles || {}),
             }
         };
    }
     if (configUpdate.toolAccess) {
         updatedConfig.toolAccess = { ...(updatedConfig.toolAccess || {}), ...configUpdate.toolAccess };
     }
      if (configUpdate.toolConfig) {
          updatedConfig.toolConfig = { ...(updatedConfig.toolConfig || {}), ...configUpdate.toolConfig };
      }

     if (configUpdate.defaultPolicy !== undefined) updatedConfig.defaultPolicy = configUpdate.defaultPolicy;
     if (configUpdate.requireAuthentication !== undefined) updatedConfig.requireAuthentication = configUpdate.requireAuthentication;
     if (configUpdate.allowUnauthenticatedAccess !== undefined) updatedConfig.allowUnauthenticatedAccess = configUpdate.allowUnauthenticatedAccess;
     // Update debug state carefully
     if (configUpdate.debug !== undefined) updatedConfig.debug = configUpdate.debug;


    this.config = updatedConfig;

    // Use the updated debug value, falling back to current state if not provided
    const newDebug = this.config.debug; // It's guaranteed boolean now
    if (newDebug !== oldDebug) {
        this.setDebugMode(newDebug);
    }

    const newJwtSecret = this.config.userAuthentication?.jwtSecret;
    if (newJwtSecret !== oldJwtSecret && typeof (this.authManager as AuthManager)?.updateSecret === 'function') {
        (this.authManager as AuthManager).updateSecret(newJwtSecret);
    }

    this.eventEmitter.emit('config:updated', { config: this.config });
    this.logger.log(`Security configuration updated. Debug: ${this.debug}. Auth Type: ${this.config.userAuthentication?.type || 'N/A'}.`);
    if (this.debug) {
         const configToLog = { ...this.config };
          if (configToLog.userAuthentication?.jwtSecret) {
               configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
          }
         this.logger.debug(`New configuration:`, configToLog);
    }
  }

  async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> { // Return extended type
    return this.authManager.authenticateUser(accessToken);
  }

  createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn: string | number = '24h'): string { // Use extended type
   try {
        if (this.config.userAuthentication?.type !== 'jwt') {
            this.logger.error(`Attempt to create JWT token, but authentication type is set to '${this.config.userAuthentication?.type || 'not jwt'}'.`);
            throw new ConfigError("Token creation is only supported for JWT authentication (userAuthentication.type='jwt').");
        }
        return this.authManager.createAccessToken({ payload: userInfo, expiresIn });
   } catch (error) {
        throw mapError(error);
   }
  }

  async checkToolAccessAndArgs(
    tool: Tool, // Use base Tool type from core
    userInfo: UserAuthInfo | null, // Use extended UserAuthInfo
    args?: any
  ): Promise<boolean> {
    const toolName = tool.function?.name || tool.name || 'unknown_tool';
    const userIdForLog = userInfo?.userId || (this.config.allowUnauthenticatedAccess ? 'anonymous' : 'UNAUTHENTICATED');
    this.logger.debug(`Security Check Sequence START for Tool: '${toolName}', User: ${userIdForLog}`);

    const context: SecurityContext = {
      config: this.config, // Pass the extended config
      debug: this.debug,
      userId: userInfo?.userId,
      toolName: toolName
    };
    const checkParams: SecurityCheckParams = { tool, userInfo, args, context, securityManager: this };

    try {
      // --- Check 1: Authentication Requirement ---
      if (!userInfo && this.config.requireAuthentication && !this.config.allowUnauthenticatedAccess) {
           this.logger.warn(`Access DENIED for tool '${toolName}': Authentication required (requireAuthentication=true), user is not authenticated, and allowUnauthenticatedAccess=false.`);
           throw new AuthenticationError(`Authentication is required to access tool '${toolName}'.`);
      }
       if (!userInfo && this.config.allowUnauthenticatedAccess) {
           const toolSecurity = tool.security;
           if (toolSecurity?.requiredRole || toolSecurity?.requiredScopes) {
                this.logger.warn(`Access DENIED for tool '${toolName}': Tool requires specific roles/scopes, but user is anonymous.`);
                throw new AuthorizationError(`Access to tool '${toolName}' requires specific permissions/roles (anonymous access denied for this tool).`);
           }
       }
       this.logger.debug(`[Check 1 PASSED] Authentication requirement met for '${toolName}'.`);


      // --- Check 2: Access Control ---
      this.logger.debug(`[Check 2 START] Access control check for '${toolName}'...`);
      await this.accessControlManager.checkAccess(checkParams);
      this.logger.debug(`[Check 2 PASSED] Access control granted for '${toolName}'.`);


      // --- Check 3: Rate Limiting ---
       if (userInfo) {
           const rateLimitConfig = this._findRateLimit(tool, userInfo);
           if (rateLimitConfig) {
                this.logger.debug(`[Check 3 START] Rate limit check for '${toolName}', User: ${userInfo.userId}. Limit source: ${rateLimitConfig._source || 'unknown'}`);
                const rateLimitResult = this.rateLimitManager.checkRateLimit({
                    userId: userInfo.userId,
                    toolName: toolName,
                    rateLimit: rateLimitConfig,
                    source: rateLimitConfig._source
                });
                 if (!rateLimitResult.allowed) {
                     const timeLeft = rateLimitResult.timeLeft ?? 0;
                     const retryAfter = Math.ceil(timeLeft / 1000);
                     this.logger.warn(`[Check 3 FAILED] Rate Limit Exceeded for tool '${toolName}', User: ${userInfo.userId}. Retry after ${retryAfter}s.`);
                     throw new ToolRateLimitError(
                         `Rate limit exceeded for tool '${toolName}'. Please try again after ${retryAfter} seconds.`,
                         429,
                         {
                             limit: rateLimitResult.limit,
                             period: rateLimitConfig.interval || rateLimitConfig.period,
                             timeLeftMs: timeLeft,
                             retryAfterSeconds: retryAfter
                         }
                     );
                 }
                 this.logger.debug(`[Check 3 PASSED] Rate limit check passed for '${toolName}'.`);
           } else {
                this.logger.debug(`[Check 3 SKIPPED] No applicable rate limit found for tool '${toolName}' and user role/config.`);
           }
       } else {
            this.logger.debug(`[Check 3 SKIPPED] User is anonymous, rate limit check skipped.`);
       }


      // --- Check 4: Argument Sanitization ---
      if (args !== undefined && args !== null) {
        this.logger.debug(`[Check 4 START] Argument sanitization for '${toolName}'...`);
        await this.argumentSanitizer.validateArguments(tool, args, context);
        this.logger.debug(`[Check 4 PASSED] Argument sanitization passed for '${toolName}'.`);
      } else {
           this.logger.debug(`[Check 4 SKIPPED] No arguments provided for tool '${toolName}'.`);
      }

      this.logger.log(`Security Check Sequence SUCCESS for Tool: '${toolName}', User: ${userIdForLog}`);
      return true;

    } catch (error) {
        const mappedError = mapError(error);
        this.logger.error(`Security Check Sequence FAILED for Tool: '${toolName}', User: ${userIdForLog}. Error: ${mappedError.message} (Code: ${mappedError.code})`, mappedError.details || mappedError);
        this.eventEmitter.emit('security:error', {
            toolName,
            userId: userInfo?.userId,
            error: mappedError,
            args
        });
        throw mappedError;
    }
  }

 private _findRateLimit(tool: Tool, userInfo: UserAuthInfo): (RateLimit & { _source?: string }) | undefined { // Use extended RateLimit
   if (!userInfo) return undefined;

   const toolName = tool.function?.name || tool.name;
   if (!toolName) {
        this.logger.warn("Cannot find rate limit: Tool name is missing.");
        return undefined;
   }

   const config = this.config;
   const toolSecurity = tool.security;
   const userRole = userInfo.role;

   let foundRateLimit: RateLimit | undefined; // Use extended RateLimit
   let source: string | undefined;

   if (userRole && config.roles?.roles?.[userRole]?.rateLimits?.[toolName]) {
     foundRateLimit = config.roles.roles[userRole].rateLimits![toolName];
     source = `Role ('${userRole}') -> Tool ('${toolName}')`;
   }
   else if (userRole && config.roles?.roles?.[userRole]?.rateLimits?.['*']) {
     foundRateLimit = config.roles.roles[userRole].rateLimits!['*'];
     source = `Role ('${userRole}') -> Tool ('*')`;
   }
   else if (config.toolAccess?.[toolName]?.rateLimit) {
     foundRateLimit = config.toolAccess[toolName].rateLimit!;
     source = `ToolAccess ('${toolName}')`;
   }
   else if (config.toolAccess?.['*']?.rateLimit) {
       foundRateLimit = config.toolAccess['*'].rateLimit!;
       source = `ToolAccess ('*')`;
   }
   else if (toolSecurity?.rateLimit) {
     foundRateLimit = toolSecurity.rateLimit;
     source = `Tool Metadata ('${toolName}')`;
   }

   if (foundRateLimit) {
        this.logger.debug(`Applicable RateLimit found for tool '${toolName}' / user '${userInfo.userId}'. Source: ${source}`);
        // Ensure the found limit conforms to ExtendedRateLimit if needed, though types should match now
        return { ...(foundRateLimit as ExtendedRateLimit), _source: source };
   }

   this.logger.debug(`No specific RateLimit configuration found for tool '${toolName}' / user '${userInfo.userId}'.`);
   return undefined;
 }

  logToolCall(event: ExtendedToolCallEvent): void { // Use extended event type
    this.logger.log(`Tool Executed: ${event.toolName}`, {
      userId: event.userId,
      success: event.success,
      durationMs: event.duration,
      argsProvided: event.args !== null && event.args !== undefined,
      error: event.error ? `${event.error.name}: ${event.error.message}` : null
    });

    if (this.debug) {
         this.logger.debug(`Tool call details for ${event.toolName}:`, {
             timestamp: new Date(event.timestamp).toISOString(),
             argsKeys: typeof event.args === 'object' && event.args !== null ? Object.keys(event.args) : null,
             resultType: typeof event.result,
             fullError: event.error,
         });
    }

    this.eventEmitter.emit('tool:call', event);
  }

  isDebugEnabled(): boolean {
    return this.debug;
  }

  setDebugMode(debug: boolean): void {
    if (this.debug === debug) return;

    this.debug = debug;
    this.logger.setDebug(debug);

    this.authManager?.setDebugMode(debug);
    this.rateLimitManager?.setDebugMode(debug);
    this.accessControlManager?.setDebugMode(debug);
    this.argumentSanitizer?.setDebugMode(debug);

    this.logger.log(`SecurityManager debug mode ${debug ? 'ENABLED' : 'DISABLED'}.`);
  }

  clearTokenCache(): void {
    this.authManager.clearTokenCache();
  }

  clearRateLimitCounters(userId?: string): void {
    this.rateLimitManager.clearLimits(userId);
  }

  on(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.on(event, handler);
    this.logger.debug(`External handler attached for security event: '${event}'`);
    return this;
  }

  off(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.off(event, handler);
    this.logger.debug(`External handler detached for security event: '${event}'`);
    return this;
  }

  destroy(): void {
     if (this._destroyed) return;

     this.logger.log("Destroying SecurityManager and its components...");
     this.rateLimitManager?.destroy?.();
     this.argumentSanitizer?.destroy?.();
     this.accessControlManager?.destroy?.();
     this.authManager?.destroy?.();
     this.eventEmitter.removeAllListeners?.();

     this._destroyed = true;
     this.logger.log("SecurityManager destroyed.");
 }
}