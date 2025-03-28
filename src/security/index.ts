// Path: security/index.ts
export * from './types';

export { SecurityManager } from './security-manager';
export { AuthManager } from './auth-manager';
export { AccessControlManager } from './access-control-manager';
export { RateLimitManager } from './rate-limit-manager';
export { ArgumentSanitizer } from './argument-sanitizer';

export const createDefaultSecurityManager = (
    config?: Partial<import('./types').SecurityConfig>,
    secretKeyOrDebug?: string | boolean
) => {
  const { SecurityManager } = require('./security-manager');

  const effectiveConfig: import('./types').SecurityConfig = {
      defaultPolicy: 'deny-all',
      debug: false, // Default debug state
      ...(config || {}), // Apply user config over defaults
       dangerousArguments: { // Ensure dangerousArguments has defaults
            auditOnlyMode: false,
            ...(config?.dangerousArguments || {})
        },
  };

  // Determine final debug state based on precedence: parameter > config > default
  let finalDebug: boolean;
  if (typeof secretKeyOrDebug === 'boolean') {
    finalDebug = secretKeyOrDebug;
  } else {
    finalDebug = effectiveConfig.debug ?? (process.env.NODE_ENV === 'development'); // Fallback to NODE_ENV only if not set
  }
  effectiveConfig.debug = finalDebug; // Set the final debug state in the config


  // Handle secret key precedence: parameter > config > undefined
  if (typeof secretKeyOrDebug === 'string') {
      if (!effectiveConfig.userAuthentication) effectiveConfig.userAuthentication = {};
      effectiveConfig.userAuthentication.jwtSecret = secretKeyOrDebug;
  }
  // Secret from config is already included via spread

  return new SecurityManager(effectiveConfig);
};