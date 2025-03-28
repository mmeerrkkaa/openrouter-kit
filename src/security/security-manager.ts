import {
  ISecurityManager,
  SecurityCheckParams,
  SecurityContext,
  ExtendedToolCallEvent,
  SecurityConfig as TypeSecurityConfig,
  UserAuthInfo as TypeUserAuthInfo,
  IAuthManager,
  IAccessControlManager,
  IRateLimitManager,
  IArgumentSanitizer,
  RateLimit
} from './types';
import { SimpleEventEmitter } from '../utils/simple-event-emitter'; 
import { AuthManager } from './auth-manager';
import { RateLimitManager } from './rate-limit-manager';
import { AccessControlManager } from './access-control-manager';
import { ArgumentSanitizer } from './argument-sanitizer';
import { Logger } from '../utils/logger';
import { Tool } from '../types';
import {
  AccessDeniedError,
  AuthorizationError,
  RateLimitError as ToolRateLimitError,
  SecurityError,
  ConfigError,
  mapError,
} from '../utils/error';

type SecurityConfig = TypeSecurityConfig;
type UserAuthInfo = TypeUserAuthInfo;

export class SecurityManager implements ISecurityManager {
  private config: SecurityConfig;
  private eventEmitter: SimpleEventEmitter; 
  private authManager: IAuthManager;
  private rateLimitManager: IRateLimitManager;
  private accessControlManager: IAccessControlManager;
  private argumentSanitizer: IArgumentSanitizer;
  private debug: boolean;
  private logger: Logger;

  constructor(config?: Partial<SecurityConfig>, secretKeyOrDebug?: string | boolean) {
    const defaultConfig: SecurityConfig = {
        defaultPolicy: 'deny-all',
        debug: false,
        requireAuthentication: false,
        allowUnauthenticatedAccess: false,
        dangerousArguments: {
            auditOnlyMode: false
        }
    };
    this.config = { ...defaultConfig, ...(config || {}) };
    if (config?.dangerousArguments) {
        this.config.dangerousArguments = {
            ...defaultConfig.dangerousArguments,
            ...config.dangerousArguments
        };
    }


    let jwtSecret = this.config.userAuthentication?.jwtSecret || '';
    this.debug = this.config.debug ?? false;

    if (typeof secretKeyOrDebug === 'string') {
      jwtSecret = secretKeyOrDebug;
      if (!this.config.userAuthentication) this.config.userAuthentication = {};
      this.config.userAuthentication.jwtSecret = jwtSecret;
      this.debug = this.config.debug ?? false;
    } else if (typeof secretKeyOrDebug === 'boolean') {
      this.debug = secretKeyOrDebug;
      this.config.debug = this.debug;
    }

    this.logger = new Logger({ debug: this.debug, prefix: 'SecurityManager' });

    this.eventEmitter = new SimpleEventEmitter(); // Instantiate directly
    const finalJwtSecret = jwtSecret || 'MISSING_SECRET';

    if (finalJwtSecret === 'MISSING_SECRET' && this.config.userAuthentication?.type === 'jwt') {
         this.logger.error('Critical vulnerability: JWT authentication is enabled but JWT Secret is not provided! Set the secret via configuration, constructor or JWT_SECRET environment variable.');
    } else if (finalJwtSecret === 'default-secret-replace-in-production' && this.config.userAuthentication?.type === 'jwt') {
         this.logger.error('Critical vulnerability: Using insecure default JWT secret. Replace it in production!');
    }

    this.authManager = new AuthManager(finalJwtSecret, this.eventEmitter, this.logger.withPrefix('AuthManager'));
    this.rateLimitManager = new RateLimitManager(this.eventEmitter, this.logger.withPrefix('RateLimitManager'));
    this.accessControlManager = new AccessControlManager(this.eventEmitter, this.logger.withPrefix('AccessControlManager'));
    this.argumentSanitizer = new ArgumentSanitizer(this.eventEmitter, this.logger.withPrefix('ArgumentSanitizer'));

    this.setDebugMode(this.debug);

    this.logger.log(`SecurityManager initialized. Debug: ${this.debug}. Default Policy: ${this.config.defaultPolicy}.`);
    if (this.debug) {
      const configToLog = { ...this.config };
      if (configToLog.userAuthentication?.jwtSecret) {
           configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
      }
      this.logger.debug(`Initial configuration:`, configToLog);
    }
  }

  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  updateConfig(configUpdate: Partial<SecurityConfig>): void {
    this.logger.log('Updating SecurityManager configuration...');
    const oldDebug = this.debug;

    // Perform deep merge for specific nested properties
    const updatedConfig = { ...this.config };

    for (const key in configUpdate) {
        if (Object.prototype.hasOwnProperty.call(configUpdate, key)) {
            const updateValue = (configUpdate as any)[key];
            if (key === 'userAuthentication' || key === 'toolAccess' || key === 'roles' || key === 'dangerousArguments') {
                 if (typeof updateValue === 'object' && updateValue !== null && !Array.isArray(updateValue)) {
                     (updatedConfig as any)[key] = { ...((this.config as any)[key] || {}), ...updateValue };
                     // Further deep merge for roles.roles if necessary
                     if (key === 'roles' && updateValue.roles) {
                        updatedConfig.roles!.roles = { ...(this.config.roles?.roles || {}), ...updateValue.roles };
                     }
                 } else {
                     (updatedConfig as any)[key] = updateValue; // Overwrite if not an object merge
                 }
            } else {
                 (updatedConfig as any)[key] = updateValue; // Standard overwrite
            }
        }
    }
    this.config = updatedConfig;


    const newDebug = this.config.debug ?? this.debug;
    if (newDebug !== oldDebug) {
        this.setDebugMode(newDebug);
    }

    const newJwtSecret = this.config.userAuthentication?.jwtSecret;
    if (newJwtSecret && (newJwtSecret === 'MISSING_SECRET' || newJwtSecret === 'default-secret-replace-in-production') && this.config.userAuthentication?.type === 'jwt') {
       this.logger.error('Critical vulnerability: JWT secret in configuration is insecure or missing after update!');
    }

    this.eventEmitter.emit('config:updated', { config: this.config });
    this.logger.log(`Security configuration updated.`);
    if (this.debug) {
         const configToLog = { ...this.config };
          if (configToLog.userAuthentication?.jwtSecret) {
               configToLog.userAuthentication = { ...configToLog.userAuthentication, jwtSecret: '***REDACTED***' };
          }
         this.logger.debug(`New configuration:`, configToLog);
    }
  }

  async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> {
    return this.authManager.authenticateUser(accessToken);
  }

  createAccessToken(userInfo: Omit<UserAuthInfo, 'expiresAt'>, expiresIn: string | number = '24h'): string {
   if (this.config.userAuthentication?.type !== 'jwt') {
       this.logger.error(`Attempt to create JWT token, but authentication type is set to '${this.config.userAuthentication?.type || 'not jwt'}'.`);
       throw new ConfigError("Token creation is only supported for JWT authentication (userAuthentication.type='jwt').", 'CONFIGURATION_ERROR');
   }
   return this.authManager.createAccessToken({ payload: userInfo, expiresIn });
  }

  async checkToolAccessAndArgs(
    tool: Tool,
    userInfo: UserAuthInfo | null,
    args?: any
  ): Promise<boolean> {
    const toolName = tool.function?.name || tool.name || 'unknown_tool';
    const userIdForLog = userInfo?.userId || (this.config.allowUnauthenticatedAccess ? 'anonymous' : 'NOT AUTHENTICATED');
    this.logger.debug(`Starting access and arguments check for tool: ${toolName}, user: ${userIdForLog}`);

    try {
      const context: SecurityContext = {
        config: this.config,
        debug: this.isDebugEnabled(),
        userId: userInfo?.userId,
        toolName: toolName
      };
      const params: SecurityCheckParams = { tool, userInfo, args, context, securityManager: this };

      if (!userInfo && !this.config.allowUnauthenticatedAccess) {
          const toolSecurity = tool.security || tool.function?.security;
          if (toolSecurity?.requiredRole || toolSecurity?.requiredScopes) {
               this.logger.warn(`Access to tool '${toolName}' requires authentication (roles/scopes), but user is not authenticated.`);
               throw new AuthorizationError(`Access to tool '${toolName}' requires authentication.`);
          }
           this.logger.warn(`Access to tool '${toolName}' denied: unauthenticated access is disabled (allowUnauthenticatedAccess=false).`);
           throw new AuthorizationError(`Access for unauthenticated users is denied.`);
      }

      this.logger.debug(`[${toolName}] Step 1: Checking access rights (AccessControlManager)...`);
      await this.accessControlManager.checkAccess(params);
      this.logger.debug(`[${toolName}] Access granted for user: ${userIdForLog}`);

      if (userInfo) {
          const rateLimitConfig = this._findRateLimit(tool, userInfo);
          if (rateLimitConfig) {
            this.logger.debug(`[${toolName}] Step 2: Checking Rate Limit (RateLimitManager) for user ${userInfo.userId}, limit: ${JSON.stringify(rateLimitConfig)}`);
            const rateLimitResult = this.rateLimitManager.checkRateLimit({
                userId: userInfo.userId,
                toolName: toolName,
                rateLimit: rateLimitConfig,
                source: rateLimitConfig._source
            });
            if (!rateLimitResult.allowed) {
              const timeLeft = rateLimitResult.timeLeft ?? 0;
              this.logger.warn(`[${toolName}] Rate Limit exceeded for user ${userInfo.userId}. Try again in ${Math.ceil(timeLeft / 1000)} sec.`);
              throw new ToolRateLimitError(
                  `Request limit exceeded (${rateLimitResult.limit} per ${rateLimitConfig.interval || rateLimitConfig.period}) for tool '${toolName}'. Please try again later.`,
                  429,
                  { timeLeft: timeLeft, limit: rateLimitResult.limit, period: rateLimitConfig.interval || rateLimitConfig.period }
              );
            }
             this.logger.debug(`[${toolName}] Rate Limit passed for user ${userInfo.userId}.`);
          } else {
              this.logger.debug(`[${toolName}] Rate Limit configuration not found for user ${userInfo.userId}, check skipped.`);
          }
      } else {
           this.logger.debug(`[${toolName}] User is not authenticated, Rate Limit check skipped.`);
      }

      if (args !== undefined && args !== null) {
        this.logger.debug(`[${toolName}] Step 3: Validating arguments for security (ArgumentSanitizer)...`);
        await this.argumentSanitizer.validateArguments(tool, args, context);
        this.logger.debug(`[${toolName}] Arguments passed security validation.`);
      } else {
           this.logger.debug(`[${toolName}] No arguments present, security validation skipped.`);
      }

      this.logger.log(`All security checks for tool '${toolName}' (user: ${userIdForLog}) passed successfully.`);
      return true;

    } catch (error) {
        const mappedError = mapError(error); // Use mapError here
        this.logger.error(`Error during tool access/arguments check for '${toolName}': ${mappedError.message}`, mappedError.details || mappedError);
        this.eventEmitter.emit('security:error', {
            toolName,
            userId: userInfo?.userId,
            error: mappedError
        });
        throw mappedError;
    }
  }

 private _findRateLimit(tool: Tool, userInfo: UserAuthInfo): (RateLimit & { _source?: string }) | undefined {
   if (!userInfo) return undefined;

   const toolName = tool.function?.name || tool.name;
   if (!toolName) return undefined;

   const config = this.config;
   const toolSecurity = tool.security || tool.function?.security;
   let foundRateLimit: (RateLimit & { _source?: string }) | undefined;

   const userRole = userInfo.role;

   if (config?.roles?.roles && userRole && config.roles.roles[userRole]?.rateLimits?.[toolName]) {
     foundRateLimit = { ...config.roles.roles[userRole].rateLimits![toolName], _source: `role '${userRole}' / tool '${toolName}'` };
     this.logger.debug(`Found RateLimit (1): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   if (config?.roles?.roles && userRole && config.roles.roles[userRole]?.rateLimits?.['*']) {
     foundRateLimit = { ...config.roles.roles[userRole].rateLimits!['*'], _source: `role '${userRole}' / tool '*'` };
     this.logger.debug(`Found RateLimit (2): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   if (config?.toolAccess?.[toolName]?.rateLimit) {
     foundRateLimit = { ...config.toolAccess[toolName].rateLimit!, _source: `toolAccess '${toolName}'` };
     this.logger.debug(`Found RateLimit (3): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   if (config?.toolAccess?.['*']?.rateLimit) {
       foundRateLimit = { ...config.toolAccess['*'].rateLimit!, _source: `toolAccess '*'` };
       this.logger.debug(`Found RateLimit (4): ${foundRateLimit._source}`);
       return foundRateLimit;
   }

   if (toolSecurity?.rateLimit) {
     foundRateLimit = { ...toolSecurity.rateLimit, _source: `tool '${toolName}' metadata` };
     this.logger.debug(`Found RateLimit (5): ${foundRateLimit._source}`);
     return foundRateLimit;
   }

   this.logger.debug(`RateLimit for tool '${toolName}' and user '${userInfo.userId}' not found.`);
   return undefined;
 }

  logToolCall(event: ExtendedToolCallEvent): void {
    this.logger.log(`Tool called: ${event.toolName}`, {
      userId: event.userId,
      success: event.success,
      durationMs: event.duration,
      argsKeys: event.args ? Object.keys(event.args) : [],
      ...(event.error && { error: event.error.message })
    });

    if (this.debug) {
         this.logger.debug(`Tool call details for ${event.toolName}:`, {
             timestamp: new Date(event.timestamp).toISOString(),
             fullArgs: event.args,
             fullResult: event.result,
             fullError: event.error,
         });
    }

    this.eventEmitter.emit('tool:call', event);
  }

  isDebugEnabled(): boolean {
    return this.debug;
  }

  setDebugMode(debug: boolean): void {
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
    this.logger.log(`Authentication token cache cleared.`);
  }

  clearRateLimitCounters(userId?: string): void {
    this.rateLimitManager.clearLimits(userId);
    if (userId) {
       this.logger.log(`Rate Limit counters cleared for user ${userId}.`);
   } else {
       this.logger.log(`All Rate Limit counters cleared.`);
   }
  }

  on(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.on(event, handler);
    this.logger.debug(`External handler added for security event: ${event}`);
    return this;
  }

  off(event: string, handler: (event: any) => void): ISecurityManager {
    this.eventEmitter.off(event, handler);
    this.logger.debug(`External handler removed for security event: ${event}`);
    return this;
  }

  destroy(): void {
     this.logger.log("Destroying SecurityManager and its components...");
     this.rateLimitManager?.destroy?.();
     this.argumentSanitizer?.destroy?.();
     this.accessControlManager?.destroy?.();
     this.authManager?.destroy?.();
     this.eventEmitter.removeAllListeners?.();
     this.logger.log("SecurityManager destroyed.");
 }
}