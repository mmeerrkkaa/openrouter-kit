// Path: security/auth-manager.ts

import jwt from 'jsonwebtoken';
import type { SignOptions, JwtPayload } from 'jsonwebtoken';
import { IAuthManager, TokenConfig, TokenValidationResult, UserAuthInfo, ISecurityEventEmitter } from './types';
import { Logger } from '../utils/logger';
import { SecurityError, ConfigError } from '../utils/error';

export class AuthManager implements IAuthManager {
  private tokenCache: Map<string, UserAuthInfo> = new Map();
  private secretKey: string;
  private eventEmitter: ISecurityEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  constructor(secretKey: string, eventEmitter: ISecurityEventEmitter, logger: Logger) {
    if (!secretKey || secretKey === 'MISSING_SECRET' || secretKey === 'default-secret-replace-in-production') {
        // Critical vulnerability warning: Insecure or missing JWT secret
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
      // Authentication skipped: access token not provided.
      this.logger.debug('Authentication skipped: access token not provided.');
      return null;
    }
    // Attempting authentication with token: ...
    this.logger.debug(`Attempting authentication with token: ${accessToken.substring(0, 10)}...`);

    if (this.tokenCache.has(accessToken)) {
      const userInfo = this.tokenCache.get(accessToken)!;
      if (userInfo.expiresAt && new Date(userInfo.expiresAt).getTime() > Date.now()) {
        // User ... authenticated from cache.
        this.logger.debug(`User ${userInfo.userId} authenticated from cache.`);
        return userInfo;
      } else {
        // Removing expired token from cache for user ...
        this.logger.debug(`Removing expired token from cache for user ${userInfo.userId}.`);
        this.tokenCache.delete(accessToken);
      }
    }

    try {
      // Use destructuring with default assignment for error
      const { isValid, userInfo, error = null } = await this.validateToken(accessToken);
      if (isValid && userInfo) {
        // Token is valid. User ... authenticated.
        this.logger.debug(`Token is valid. User ${userInfo.userId} authenticated.`);
        this.tokenCache.set(accessToken, userInfo);
        this.eventEmitter.emit('user:authenticated', { userInfo });
        return userInfo;
      } else {
          const reason = error ? error.message : 'validation returned false';
          // Authentication failed: token invalid (...).
          this.logger.warn(`Authentication failed: token invalid (${reason}).`);
      }
    } catch (error) {
      // Unexpected error during authentication:
      this.logger.error('Unexpected error during authentication:', error);
      this.eventEmitter.emit('auth:error', {
        // Authentication error
        message: 'Authentication error',
        error
      });
    }

    return null;
  }

  createAccessToken(config: TokenConfig): string {
     // Check if the secret key is insecure or missing before creating a token
     if (this.secretKey === 'MISSING_SECRET' || this.secretKey === 'default-secret-replace-in-production') {
         // Cannot create token: insecure JWT secret not set.
         this.logger.error('Cannot create token: insecure JWT secret not set.');
         // Cannot create token: JWT secret not configured.
         throw new SecurityError('Cannot create token: JWT secret not configured.', 'CONFIGURATION_ERROR');
     }

    // expiresIn can be string | number | undefined from TokenConfig
    const { payload, expiresIn } = config;
    // Creating token for user ... with expiration ...
    this.logger.debug(`Creating token for user ${payload.userId} with expiration ${expiresIn || 'default'}`);

    // Ensure userId is present in the payload
    if (!payload.userId) {
      // Error creating token: missing required field userId in payload.
      this.logger.error('Error creating token: missing required field userId in payload.');
      // userId is required to create a token
      throw new SecurityError('userId is required to create a token', 'VALIDATION_ERROR');
    }

    let token: string;
    try {
        // Construct payload for JWT
        const jwtPayload: object = { // Explicitly type as object
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
            signOptions.expiresIn = expiresIn as number;
        } else {
            signOptions.expiresIn = '24h';
        }

        token = jwt.sign(jwtPayload, this.secretKey, signOptions);

    } catch (error) {
        // Error signing JWT token:
        this.logger.error('Error signing JWT token:', error);
        // Error creating JWT token: ...
        throw new SecurityError(`Error creating JWT token: ${(error as Error).message}`, 'JWT_SIGN_ERROR');
    }

    const decoded = jwt.decode(token) as JwtPayload | null; // decode может вернуть null
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

    const userInfo: UserAuthInfo = {
      userId: payload.userId,
      ...payload,
      expiresAt: expiresAt,
    };

    if (!userInfo.userId) {
        // Critical error: userId field missing in userInfo after token creation.
        this.logger.error('Critical error: userId field missing in userInfo after token creation.');
        // Critical error: userId field missing in userInfo after token creation.
        throw new SecurityError('Critical error: userId field missing in userInfo after token creation.', 'INTERNAL_ERROR');
    }

    this.tokenCache.set(token, userInfo);
    // Token for user ... created and cached.
    this.logger.debug(`Token for user ${payload.userId} created and cached.`);

    this.eventEmitter.emit('token:created', {
      userId: payload.userId,
      expiresAt: userInfo.expiresAt
    });

    return token;
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    // Validating token: ...
    this.logger.debug(`Validating token: ${token.substring(0, 10)}...`);
    // Check if the secret key is insecure or missing before validating
    if (this.secretKey === 'MISSING_SECRET' || this.secretKey === 'default-secret-replace-in-production') {
         // Cannot validate token: insecure JWT secret not set.
         this.logger.error('Cannot validate token: insecure JWT secret not set.');
         // JWT secret not configured.
         return { isValid: false, error: new SecurityError('JWT secret not configured.', 'CONFIGURATION_ERROR') };
     }

    try {
      // Type the result as JwtPayload
      const decoded = jwt.verify(token, this.secretKey) as JwtPayload;

      // Check for the mandatory userId field and ensure payload is an object
      if (!decoded || typeof decoded !== 'object' || !decoded.userId) {
         // Token validation failed: missing userId in payload or payload is not an object.
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

      // Token successfully validated for user ...
      this.logger.debug(`Token successfully validated for user ${userInfo.userId}.`);
      return { isValid: true, userInfo };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Token validation error: ...
      this.logger.warn(`Token validation error: ${errorMessage}`);
      this.eventEmitter.emit('token:invalid', { token, error });
      return { isValid: false, error: error as Error };
    }
  }

  clearTokenCache(): void {
    // Token cache cleared.
    this.tokenCache.clear();
    this.logger.log('Token cache cleared.');
    this.eventEmitter.emit('cache:cleared', { type: 'token' });
  }

  destroy(): void {
      // AuthManager destroyed.
      this.logger.log("AuthManager destroyed.");
      this.clearTokenCache();
  }
}