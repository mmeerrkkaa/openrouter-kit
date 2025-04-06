// Path: src/security/index.ts
// Export all types from security/types, including the extended ones
export * from './types';

export { SecurityManager } from './security-manager';
export { AuthManager } from './auth-manager';
export { AccessControlManager } from './access-control-manager';
export { RateLimitManager } from './rate-limit-manager';
export { ArgumentSanitizer } from './argument-sanitizer';

// Import the extended config type for the factory function
import { ExtendedSecurityConfig } from './types';
// Import SecurityManager class *type* for return type annotation
import { SecurityManager as SecurityManagerClass } from './security-manager';


export const createDefaultSecurityManager = (
    // Accept partial extended config
    config?: Partial<ExtendedSecurityConfig>,
    secretKeyOrDebug?: string | boolean
): SecurityManagerClass => {
  const { SecurityManager } = require('./security-manager');

  // Define effectiveConfig with the extended type
  const effectiveConfig: ExtendedSecurityConfig = {
      // Start with defaults that satisfy the extended type
      defaultPolicy: 'deny-all',
      debug: false, // debug is required in ExtendedSecurityConfig
      requireAuthentication: false,
      allowUnauthenticatedAccess: false,
      // Apply user config over defaults
      ...(config || {}),
      // Ensure nested dangerousArguments has defaults and merges correctly
       dangerousArguments: {
            auditOnlyMode: false, // Default for extended type
            ...(config?.dangerousArguments || {})
        },
       // Ensure userAuthentication exists for potential secret assignment
       userAuthentication: {
           type: 'jwt', // Default type
           ...(config?.userAuthentication || {})
       }
  };

  // Determine final debug state
  let finalDebug: boolean;
  if (typeof secretKeyOrDebug === 'boolean') {
    finalDebug = secretKeyOrDebug;
  } else {
    // effectiveConfig.debug is now guaranteed boolean
    finalDebug = effectiveConfig.debug ?? false; // Fallback just in case
  }
  effectiveConfig.debug = finalDebug;


  // Handle secret key precedence
  if (typeof secretKeyOrDebug === 'string') {
      // userAuthentication is guaranteed to exist here
      effectiveConfig.userAuthentication!.jwtSecret = secretKeyOrDebug;
  }

  // Pass the fully constructed ExtendedSecurityConfig
  return new SecurityManager(effectiveConfig);
};