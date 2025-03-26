// Path: security/index.ts
/**
 * Security module for the OpenRouter Kit Library.
 * Exports all components of the security system.
 */

// Types and interfaces
export * from './types';

// Components
export { SecurityManager } from './security-manager';
export { AuthManager } from './auth-manager';
export { AccessControlManager } from './access-control-manager';
export { RateLimitManager } from './rate-limit-manager';
export { ArgumentSanitizer } from './argument-sanitizer';
export { SecurityEventEmitter } from './security-event-emitter';


/**
 * Creates a security manager instance with default settings.
 * @param config Security configuration (optional).
 * @param secretKey Secret key for tokens (optional, can be set in config.userAuthentication.jwtSecret).
 * @param debug Debug flag (optional, can be set in config.debug).
 * @returns {SecurityManager} A new SecurityManager instance.
 */
export const createDefaultSecurityManager = (
    config?: Partial<import('./types').SecurityConfig>,
    secretKey?: string,
    debug?: boolean
) => {
  // Use require to avoid potential circular dependencies at the type level
  const { SecurityManager } = require('./security-manager');

  // Define the effective configuration, merging defaults with provided config
  const effectiveConfig: import('./types').SecurityConfig = {
      defaultPolicy: 'deny-all', // Secure default policy
      // Enable debug by default in development environment if not specified
      debug: debug ?? process.env.NODE_ENV === 'development',
      ...config, // Provided config overrides default values
  };

  // Set the secret key if provided separately and not set in the config
  if (secretKey && !effectiveConfig.userAuthentication?.jwtSecret) {
      if (!effectiveConfig.userAuthentication) effectiveConfig.userAuthentication = {};
      effectiveConfig.userAuthentication.jwtSecret = secretKey;
  }

  // Set the debug flag if provided separately
  if (debug !== undefined) {
      effectiveConfig.debug = debug;
  }

  return new SecurityManager(effectiveConfig);
};