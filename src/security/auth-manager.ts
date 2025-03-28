// Path: security/auth-manager.ts
import jwt from 'jsonwebtoken';
import type { SignOptions, JwtPayload } from 'jsonwebtoken';
import { IAuthManager, TokenConfig, TokenValidationResult, UserAuthInfo } from './types';
import { Logger } from '../utils/logger';
import { SecurityError, ConfigError } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

export class AuthManager implements IAuthManager {
  private tokenCache: Map<string, UserAuthInfo> = new Map();
  private secretKey: string;
  private eventEmitter: SimpleEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(secretKey: string, eventEmitter: SimpleEventEmitter, logger: Logger) {
    if (!secretKey || secretKey === 'MISSING_SECRET' || secretKey === 'default-secret-replace-in-production') {
        logger.error("Critical vulnerability: Using insecure or missing JWT secret! Set a strong secret via configuration or the JWT_SECRET environment variable.");
        this.secretKey = 'default-secret-replace-in-production';
    } else {
        this.secretKey = secretKey;
    }
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  async authenticateUser(accessToken?: string): Promise<UserAuthInfo | null> {
    if (!accessToken) {
      this.logger.debug('Authentication skipped: access token not provided.');
      return null;
    }
    this.logger.debug(`Attempting authentication with token: ${accessToken.substring(0, 10)}...`);

    if (this.tokenCache.has(accessToken)) {
      const userInfo = this.tokenCache.get(accessToken)!;
      if (userInfo.expiresAt && new Date(userInfo.expiresAt).getTime() > Date.now()) {
        this.logger.debug(`User ${userInfo.userId} authenticated from cache.`);
        return userInfo;
      } else {
        this.logger.debug(`Removing expired token from cache for user ${userInfo.userId}.`);
        this.tokenCache.delete(accessToken);
      }
    }

    try {
      const { isValid, userInfo, error = null } = await this.validateToken(accessToken);
      if (isValid && userInfo) {
        this.logger.debug(`Token is valid. User ${userInfo.userId} authenticated.`);
        this.tokenCache.set(accessToken, userInfo);
        this.eventEmitter.emit('user:authenticated', { userInfo });
        return userInfo;
      } else {
          const reason = error ? error.message : 'validation returned false';
          this.logger.warn(`Authentication failed: token invalid (${reason}).`);
      }
    } catch (error) {
      this.logger.error('Unexpected error during authentication:', error);
      this.eventEmitter.emit('auth:error', {
        message: 'Authentication error',
        error
      });
    }

    return null;
  }

  createAccessToken(config: TokenConfig): string {
     if (this.secretKey === 'MISSING_SECRET' || this.secretKey === 'default-secret-replace-in-production') {
         this.logger.error('Cannot create token: insecure JWT secret not set.');
         throw new SecurityError('Cannot create token: JWT secret not configured.', 'CONFIGURATION_ERROR');
     }

    const { payload, expiresIn } = config;
    this.logger.debug(`Creating token for user ${payload.userId} with expiration ${expiresIn || 'default'}`);

    if (!payload.userId) {
      this.logger.error('Error creating token: missing required field userId in payload.');
      throw new SecurityError('userId is required to create a token', 'VALIDATION_ERROR');
    }

    let token: string;
    try {
        const jwtPayload: object = {
            userId: payload.userId,
            ...(payload.role && { role: payload.role }),
            ...(payload.scopes && { scopes: payload.scopes }),
            ...(payload.username && { username: payload.username }),
            ...(payload.roles && { roles: payload.roles }),
            ...(payload.permissions && { permissions: payload.permissions }),
            ...(payload.metadata && { metadata: payload.metadata }),
            ...(payload.apiKey && { apiKey: payload.apiKey }),
        };

        const signOptions: SignOptions = {};

        if (expiresIn !== undefined) {
             signOptions.expiresIn = expiresIn as any;
        } else {
            signOptions.expiresIn = '24h'; // Default expiration
        }

        token = jwt.sign(jwtPayload, this.secretKey, signOptions);

    } catch (error) {
        this.logger.error('Error signing JWT token:', error);
        throw new SecurityError(`Error creating JWT token: ${(error as Error).message}`, 'JWT_SIGN_ERROR');
    }

    const decoded = jwt.decode(token) as JwtPayload | null;
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

    const userInfo: UserAuthInfo = {
      userId: payload.userId,
      ...payload,
      expiresAt: expiresAt,
    };

    if (!userInfo.userId) {
        this.logger.error('Critical error: userId field missing in userInfo after token creation.');
        throw new SecurityError('Critical error: userId field missing in userInfo after token creation.', 'INTERNAL_ERROR');
    }

    this.tokenCache.set(token, userInfo);
    this.logger.debug(`Token for user ${payload.userId} created and cached.`);

    this.eventEmitter.emit('token:created', {
      userId: payload.userId,
      expiresAt: userInfo.expiresAt
    });

    return token;
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    this.logger.debug(`Validating token: ${token.substring(0, 10)}...`);
    if (this.secretKey === 'MISSING_SECRET' || this.secretKey === 'default-secret-replace-in-production') {
         this.logger.error('Cannot validate token: insecure JWT secret not set.');
         return { isValid: false, error: new SecurityError('JWT secret not configured.', 'CONFIGURATION_ERROR') };
     }

    try {
      const decoded = jwt.verify(token, this.secretKey) as JwtPayload;

      if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
         this.logger.warn(`Token validation failed: missing userId in payload or payload is not an object.`);
        return { isValid: false };
      }

      const userInfo: UserAuthInfo = {
        userId: decoded.userId as string,
        role: decoded.role as string | undefined,
        scopes: Array.isArray(decoded.scopes) ? decoded.scopes as string[] : undefined,
        apiKey: decoded.apiKey as string | undefined,
        username: decoded.username as string | undefined,
        roles: Array.isArray(decoded.roles) ? decoded.roles as string[] : undefined,
        permissions: Array.isArray(decoded.permissions) ? decoded.permissions as string[] : undefined,
        metadata: typeof decoded.metadata === 'object' && decoded.metadata !== null ? decoded.metadata as Record<string, any> : undefined,
        expiresAt: decoded.exp ? decoded.exp * 1000 : undefined
      };

      this.logger.debug(`Token successfully validated for user ${userInfo.userId}.`);
      return { isValid: true, userInfo };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Token validation error: ${errorMessage}`);
      this.eventEmitter.emit('token:invalid', { token, error });
      return { isValid: false, error: error as Error };
    }
  }

  clearTokenCache(): void {
    this.tokenCache.clear();
    this.logger.log('Token cache cleared.');
    this.eventEmitter.emit('cache:cleared', { type: 'token' });
  }

  destroy(): void {
      this.logger.log("AuthManager destroyed.");
      this.clearTokenCache();
  }
}