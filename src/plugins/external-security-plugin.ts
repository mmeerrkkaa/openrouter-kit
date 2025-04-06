// Path: src/plugins/external-security-plugin.ts
import type { OpenRouterPlugin, Tool, UserAuthInfo } from '../types';
// Import the RENAMED extended SecurityConfig type
import type { ExtendedSecurityConfig } from '../security/types';
import type { OpenRouterClient } from '../client';
import { SecurityManager } from '../security/security-manager';
import { AccessDeniedError, mapError, RateLimitError, AuthenticationError, AuthorizationError } from '../utils/error';

/**
 * Example plugin that replaces the built-in SecurityManager with a custom one.
 * This custom manager could integrate with external authentication (OAuth, SAML),
 * policy decision points (OPA, custom API), or rate limiting services.
 *
 * @param externalConfig - Configuration specific to the external security integration.
 */
export function createExternalSecurityPlugin(
    externalConfig: { authUrl?: string; policyUrl?: string; apiKey?: string } = {}
): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const logger = client['logger']?.withPrefix('ExternalSecurityPlugin');

      const originalSecurityConfig = client.getSecurityManager()?.getConfig() || {};

      class ExternalSecurityManager extends SecurityManager {
        private externalAuthUrl?: string;
        private externalPolicyUrl?: string;
        private externalApiKey?: string;

        constructor(
            // Accept partial extended config
            config: Partial<ExtendedSecurityConfig>,
            pluginOptions: typeof externalConfig
        ) {
          // Merge potentially partial config with original extended config
          const effectiveConfig: ExtendedSecurityConfig = {
              ...(originalSecurityConfig as ExtendedSecurityConfig), // Cast original if needed
              ...config
          };
          // Ensure debug is boolean
          effectiveConfig.debug = typeof effectiveConfig.debug === 'boolean' ? effectiveConfig.debug : client.isDebugMode();

          super(effectiveConfig, client.isDebugMode()); // Pass merged config and debug state

          this.externalAuthUrl = pluginOptions.authUrl;
          this.externalPolicyUrl = pluginOptions.policyUrl;
          this.externalApiKey = pluginOptions.apiKey;

          this['logger'].log('ExternalSecurityManager initialized.');
        }

        // ... (rest of the ExternalSecurityManager methods remain the same) ...
         override async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> {
           // ... (implementation as before) ...
           this['logger'].debug(`External authenticateUser called. Token present: ${!!accessToken}`);
           if (!this.externalAuthUrl) {
             this['logger'].warn('External auth URL not configured, falling back to default JWT/internal auth.');
             return await super.authenticateUser(accessToken);
           }
           if (!accessToken) {
              this['logger'].debug('No access token provided for external authentication.');
              if (this.getConfig().requireAuthentication) {
                  throw new AuthenticationError("Authentication required, but no token provided for external check.", 401);
              }
              return null;
           }
           try {
             this['logger'].log(`Calling external auth service at ${this.externalAuthUrl}...`);
             await new Promise(res => setTimeout(res, 50));
             if (accessToken === 'valid-external-token') {
                  const userInfo: UserAuthInfo = { userId: 'external-user-123', role: 'editor', scopes: ['read', 'write'] };
                  this['logger'].log(`External authentication successful for userId: ${userInfo.userId}`);
                  this['eventEmitter'].emit('user:authenticated', { userInfo });
                  return userInfo;
             } else {
                  this['logger'].warn(`External authentication failed for token: ${accessToken.substring(0,10)}...`);
                  return null;
             }
           } catch (error) {
             this['logger'].error(`Error during external authentication: ${(error as Error).message}`);
             this['eventEmitter'].emit('auth:error', { message: 'External authentication failed', error });
             return null;
           }
         }
         override async checkToolAccessAndArgs(
           tool: Tool,
           userInfo: UserAuthInfo | null,
           args?: any
         ): Promise<boolean> {
            // ... (implementation as before) ...
            const toolName = tool.function?.name || tool.name || 'unknown_tool';
            this['logger'].debug(`External checkToolAccessAndArgs for tool: ${toolName}, user: ${userInfo?.userId || 'anonymous'}`);
            const currentConfig = this.getConfig();
            const context: import('../security/types').SecurityContext = {
                 config: currentConfig,
                 debug: this.isDebugEnabled(),
                 userId: userInfo?.userId,
                 toolName: toolName
             };
            await this['argumentSanitizer'].validateArguments(tool, args, context);
            this['logger'].debug(`[External Check] Argument sanitization passed for ${toolName}.`);
            if (this.externalPolicyUrl) {
              this['logger'].log(`Calling external policy service at ${this.externalPolicyUrl}...`);
              try {
                  await new Promise(res => setTimeout(res, 50));
                  const decision = { allowed: toolName !== 'delete_everything' };
                  if (!decision.allowed) {
                      const reason = (decision as any).reason || 'Denied by external policy';
                      this['logger'].warn(`Access to '${toolName}' denied by external policy. Reason: ${reason}`);
                      this['eventEmitter'].emit('access:denied', { userId: userInfo?.userId, toolName, reason });
                      throw new AccessDeniedError(`Access to tool ${toolName} denied by external policy: ${reason}`, 403);
                  }
                  this['logger'].log(`Access to '${toolName}' granted by external policy.`);
                  this['eventEmitter'].emit('access:granted', { userId: userInfo?.userId, toolName });
              } catch (error) {
                   this['logger'].error(`Error during external policy check for ${toolName}: ${(error as Error).message}`);
                   throw mapError(error);
              }
            } else {
              this['logger'].debug('External policy URL not configured, falling back to internal access control check.');
              await this['accessControlManager'].checkAccess({ tool, userInfo, args, context });
              this['logger'].debug(`Internal access control check passed for ${toolName}.`);
            }
            if (userInfo) {
              const rateLimitConfig = this['_findRateLimit'](tool, userInfo);
              if (rateLimitConfig) {
                  this['logger'].debug(`[External Check] Checking internal rate limit for ${toolName}...`);
                  const rateLimitResult = this['rateLimitManager'].checkRateLimit({
                      userId: userInfo.userId,
                      toolName: toolName,
                      rateLimit: rateLimitConfig,
                      source: rateLimitConfig._source
                  });
                  if (!rateLimitResult.allowed) {
                      const timeLeft = rateLimitResult.timeLeft ?? 0;
                      const retryAfter = Math.ceil(timeLeft / 1000);
                      this['logger'].warn(`[External Check] Rate Limit Exceeded for user ${userInfo.userId}. Retry after ${retryAfter}s.`);
                      throw new RateLimitError(
                           `Rate limit exceeded for tool '${toolName}'. Please try again after ${retryAfter} seconds.`,
                           429,
                           { limit: rateLimitResult.limit, period: rateLimitConfig.interval || rateLimitConfig.period, timeLeftMs: timeLeft, retryAfterSeconds: retryAfter }
                      );
                  }
                   this['logger'].debug(`[External Check] Internal rate limit passed for ${toolName}.`);
              }
            }
            this['logger'].log(`All external/internal security checks passed for tool '${toolName}'.`);
            return true;
         }

      } // End of ExternalSecurityManager class

      const externalSecManager = new ExternalSecurityManager({}, externalConfig);

      client.setSecurityManager(externalSecManager);
      logger?.log?.('External SecurityManager plugin initialized and replaced default manager.');
    }
  };
}