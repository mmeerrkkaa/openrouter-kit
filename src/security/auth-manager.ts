// Path: src/security/auth-manager.ts
import jwt from 'jsonwebtoken';
// StringValue is internal, remove import
import type { SignOptions, JwtPayload } from 'jsonwebtoken';
import {
    IAuthManager,
    TokenConfig,
    TokenValidationResult,
    ExtendedUserAuthInfo as UserAuthInfo, // Use renamed type locally
    UserAuthConfig
} from './types';
import { Logger } from '../utils/logger';
// Import AuthorizationError correctly
import { SecurityError, ConfigError, AuthenticationError, AuthorizationError, mapError, ErrorCode } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

const INSECURE_SECRET_WARNING = "Critical security risk: Using insecure default JWT secret. Set a strong secret via configuration or JWT_SECRET environment variable!";
const MISSING_SECRET_ERROR = "JWT secret is missing. Cannot perform JWT operations.";

export class AuthManager implements IAuthManager {
  private tokenCache: Map<string, UserAuthInfo> = new Map();
  private authConfig: UserAuthConfig;
  private jwtSecret: string | undefined;
  private eventEmitter: SimpleEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(
      authConfig: UserAuthConfig | undefined,
      eventEmitter: SimpleEventEmitter,
      logger: Logger
    ) {
    this.authConfig = authConfig || {};
    this.eventEmitter = eventEmitter;
    this.logger = logger;
    this.jwtSecret = this.authConfig.jwtSecret;

    if (this.authConfig.type === 'jwt') {
        if (!this.jwtSecret) {
            this.logger.error(MISSING_SECRET_ERROR + " Auth type is 'jwt'.");
        } else if (this.jwtSecret === 'default-secret-replace-in-production') {
            this.logger.error(INSECURE_SECRET_WARNING);
        }
    } else if (this.jwtSecret) {
         this.logger.warn(`JWT secret provided, but authentication type is '${this.authConfig.type || 'not set'}'. Secret will be ignored for non-JWT operations.`);
    }
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
     if (typeof (this.logger as any).setDebug === 'function') {
        (this.logger as any).setDebug(debug);
    }
  }

  updateSecret(newSecret: string | undefined): void {
      if (this.jwtSecret !== newSecret) {
          this.logger.log("JWT secret updated.");
          this.jwtSecret = newSecret;
          this.clearTokenCache();
          if (this.authConfig.type === 'jwt') {
               if (!this.jwtSecret) {
                   this.logger.error(MISSING_SECRET_ERROR + " Auth type is 'jwt'.");
               } else if (this.jwtSecret === 'default-secret-replace-in-production') {
                    this.logger.error(INSECURE_SECRET_WARNING);
               }
           }
      }
  }

  async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> {
    if (!accessToken) {
      this.logger.debug('Authentication skipped: access token not provided.');
      return null;
    }

    if (this.tokenCache.has(accessToken)) {
      const cachedUserInfo = this.tokenCache.get(accessToken)!;
      if (!cachedUserInfo.expiresAt || new Date(cachedUserInfo.expiresAt).getTime() > Date.now()) {
        this.logger.debug(`User ${cachedUserInfo.userId} authenticated from cache.`);
        this.eventEmitter.emit('auth:cache_hit', { userId: cachedUserInfo.userId });
        return cachedUserInfo;
      } else {
        this.logger.debug(`Removing expired token from cache for user ${cachedUserInfo.userId}.`);
        this.tokenCache.delete(accessToken);
        this.eventEmitter.emit('auth:cache_expired', { userId: cachedUserInfo.userId });
      }
    } else {
        this.logger.debug(`Token not found in cache: ${accessToken.substring(0, 10)}...`);
    }

    let userInfo: UserAuthInfo | null = null;
    let validationError: Error | null = null;

    try {
        // Use optional chaining for safer access
        switch (this.authConfig?.type) {
            case 'jwt':
                this.logger.debug(`Attempting JWT validation...`);
                const jwtResult = await this.validateToken(accessToken);
                if (jwtResult.isValid && jwtResult.userInfo) {
                    userInfo = jwtResult.userInfo;
                } else {
                    validationError = jwtResult.error || new AuthenticationError("JWT validation failed");
                }
                break;

            case 'custom':
                this.logger.debug(`Attempting Custom authenticator validation...`);
                // Use optional chaining
                if (typeof this.authConfig?.customAuthenticator === 'function') {
                    userInfo = await this.authConfig.customAuthenticator(accessToken);
                    if (!userInfo) {
                         validationError = new AuthenticationError("Custom authenticator rejected the token");
                    }
                } else {
                    this.logger.error("Custom authentication configured, but 'customAuthenticator' function is missing.");
                    validationError = new ConfigError("Custom authenticator function not provided in configuration");
                }
                break;

            case 'api-key':
                this.logger.warn("API Key authentication type not fully implemented yet.");
                 validationError = new ConfigError("API Key authentication not implemented");
                break;

            default:
                // Use optional chaining
                this.logger.warn(`Unknown or unspecified authentication type: '${this.authConfig?.type || 'not set'}'. Denying authentication.`);
                validationError = new ConfigError(`Unsupported authentication type: ${this.authConfig?.type}`);
        }
    } catch (error) {
        this.logger.error('Unexpected error during authentication:', error);
        validationError = mapError(error);
    }

    if (userInfo && userInfo.userId) {
        // Use optional chaining
        this.logger.log(`Authentication successful for user ${userInfo.userId} (Type: ${this.authConfig?.type || 'jwt'}). Caching token.`);
        this.tokenCache.set(accessToken, userInfo);
        this.eventEmitter.emit('user:authenticated', { userInfo });
        return userInfo;
    } else {
        const reason = validationError ? validationError.message : (userInfo ? 'User info missing userId' : 'Authenticator returned null');
        this.logger.warn(`Authentication failed. Reason: ${reason}`);
        this.eventEmitter.emit('auth:failed', { tokenProvided: !!accessToken, reason });
        return null;
    }
  }

  createAccessToken(config: TokenConfig): string {
     // Use optional chaining
     if (this.authConfig?.type !== 'jwt') {
         this.logger.error(`Cannot create JWT token: Authentication type is '${this.authConfig?.type || 'not set'}', not 'jwt'.`);
         throw new ConfigError("Token creation is only supported when userAuthentication.type is 'jwt'.");
     }
     if (!this.jwtSecret) {
          this.logger.error(MISSING_SECRET_ERROR);
          throw new SecurityError(MISSING_SECRET_ERROR, ErrorCode.CONFIG_ERROR);
      }
     if (this.jwtSecret === 'default-secret-replace-in-production') {
          this.logger.error(INSECURE_SECRET_WARNING + " Refusing to create token.");
         throw new SecurityError('Cannot create token with insecure default secret.', ErrorCode.CONFIG_ERROR);
     }

    const { payload, expiresIn } = config;
    this.logger.debug(`Creating JWT token for user ${payload.userId} with expiration: ${expiresIn || 'default (e.g., 24h)'}`);

    if (!payload || !payload.userId) {
      this.logger.error('Error creating JWT token: payload missing or missing required field "userId".');
      throw new SecurityError('Payload with userId is required to create a JWT token', ErrorCode.VALIDATION_ERROR);
    }

    let token: string;
    try {
        const jwtPayload: Record<string, any> = {
            userId: payload.userId,
            ...(payload.role && { role: payload.role }),
            ...(payload.scopes && Array.isArray(payload.scopes) && { scopes: payload.scopes }),
            ...(payload.username && { username: payload.username }),
            ...(payload.roles && Array.isArray(payload.roles) && { roles: payload.roles }),
            ...(payload.permissions && Array.isArray(payload.permissions) && { permissions: payload.permissions }),
            ...(payload.metadata && typeof payload.metadata === 'object' && { metadata: payload.metadata }),
            ...(payload.apiKey && { apiKey: payload.apiKey }),
             iat: Math.floor(Date.now() / 1000),
        };

        const signOptions: SignOptions = {};
        // Use 'as any' to bypass the strict StringValue type from @types/jsonwebtoken
        signOptions.expiresIn = expiresIn as any;

        token = jwt.sign(jwtPayload, this.jwtSecret, signOptions);

    } catch (error) {
        this.logger.error('Error signing JWT token:', error);
        throw new SecurityError(`Error creating JWT token: ${(error as Error).message}`, ErrorCode.JWT_SIGN_ERROR);
    }

    let expiresAtMs: number | undefined;
    try {
        const decoded = jwt.decode(token) as JwtPayload | null;
        if (decoded?.exp) {
             expiresAtMs = decoded.exp * 1000;
         }
    } catch (decodeError) {
         this.logger.warn("Could not decode the newly signed token to cache expiration time.", decodeError);
    }

    // Explicitly include userId along with spread to satisfy UserAuthInfo requirement
    const userInfoToCache: UserAuthInfo = {
      userId: payload.userId, // Ensure userId is explicitly present
      ...payload,
      expiresAt: expiresAtMs,
    };

    // This check should now always pass, but kept as a safeguard
    if (!userInfoToCache.userId) {
        this.logger.error('Critical error: userId field missing in userInfo after token creation and decoding.');
        throw new SecurityError('userId missing after token creation', ErrorCode.INTERNAL_ERROR);
    }

    this.tokenCache.set(token, userInfoToCache);
    this.logger.debug(`JWT Token for user ${payload.userId} created and cached (Expires: ${expiresAtMs ? new Date(expiresAtMs).toISOString() : 'N/A'}).`);

    this.eventEmitter.emit('token:created', {
      userId: payload.userId,
      expiresAt: userInfoToCache.expiresAt
    });

    return token;
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    this.logger.debug(`Validating JWT token: ${token.substring(0, 10)}...`);

    // Use optional chaining
    if (this.authConfig?.type !== 'jwt') {
        this.logger.error("validateToken called, but auth type is not 'jwt'.");
        return { isValid: false, error: new ConfigError("JWT validation attempted for non-JWT auth type.") };
    }
    if (!this.jwtSecret) {
         this.logger.error(MISSING_SECRET_ERROR);
         return { isValid: false, error: new SecurityError(MISSING_SECRET_ERROR, ErrorCode.CONFIG_ERROR) };
     }

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;

      if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
         this.logger.warn(`JWT validation failed: missing "userId" in payload or payload is not an object.`);
         this.eventEmitter.emit('token:invalid', { token, error: new Error('Missing userId or invalid payload structure') });
         return { isValid: false, error: new AuthenticationError('Invalid token payload structure') };
      }

      const userInfo: UserAuthInfo = {
        userId: decoded.userId as string,
        role: typeof decoded.role === 'string' ? decoded.role : undefined,
        scopes: Array.isArray(decoded.scopes) ? decoded.scopes.filter((s: any) => typeof s === 'string') : undefined,
        apiKey: typeof decoded.apiKey === 'string' ? decoded.apiKey : undefined,
        username: typeof decoded.username === 'string' ? decoded.username : undefined,
        roles: Array.isArray(decoded.roles) ? decoded.roles.filter((r: any) => typeof r === 'string') : undefined,
        permissions: Array.isArray(decoded.permissions) ? decoded.permissions.filter((p: any) => typeof p === 'string') : undefined,
        metadata: typeof decoded.metadata === 'object' && decoded.metadata !== null ? decoded.metadata as Record<string, any> : undefined,
        expiresAt: decoded.exp ? decoded.exp * 1000 : undefined
      };

      this.logger.debug(`JWT Token successfully validated for user ${userInfo.userId}.`);
      return { isValid: true, userInfo };

    } catch (error) {
      const typedError = error as Error;
      const errorMessage = typedError.message || String(error);
      this.logger.warn(`JWT token validation error: ${errorMessage}`);
      this.eventEmitter.emit('token:invalid', { token, error: typedError });
      // Use AuthorizationError with JWT_VALIDATION_ERROR code
      return { isValid: false, error: new AuthorizationError(`Token validation failed: ${errorMessage}`, 401, { originalError: typedError, code: ErrorCode.JWT_VALIDATION_ERROR }) };
    }
  }

  clearTokenCache(): void {
    const count = this.tokenCache.size;
    this.tokenCache.clear();
    this.logger.log(`In-memory token cache cleared (${count} entries removed).`);
    this.eventEmitter.emit('cache:cleared', { type: 'token' });
  }

  destroy(): void {
      this.logger.log("AuthManager destroyed.");
      this.clearTokenCache();
  }
}