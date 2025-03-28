// Path: utils/validation.ts
import { ConfigError } from './error';
// Import ExtendedRateLimit specifically if needed, otherwise rely on base RateLimit from types
import { OpenRouterConfig, SecurityConfig, RateLimit, ToolAccessConfig, RoleConfig, UserAuthConfig, DangerousArgumentsConfig } from '../types';
import { Logger } from './logger';

const logger = new Logger({ debug: false, prefix: 'Validation' });

function isValidUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') {
      return false;
  }
  try {
    const baseUrl = urlString.includes(':') ? undefined : 'http://base.example';
    const parsedUrl = new URL(urlString, baseUrl);
    const protocol = parsedUrl.protocol.toLowerCase();
    return ['http:', 'https:', 'ws:', 'wss:'].includes(protocol);
  } catch (e) {
    return false;
  }
}

// The function now accepts RateLimit which includes the optional interval
function validateRateLimit(limit: RateLimit | undefined, context: string): void {
    if (limit === undefined) return;
    if (typeof limit !== 'object' || limit === null) {
        throw new ConfigError(`${context}: rateLimit must be an object.`);
    }
    if (typeof limit.limit !== 'number' || limit.limit <= 0) {
        throw new ConfigError(`${context}: rateLimit.limit must be a positive number.`);
    }
    if (!['second', 'minute', 'hour', 'day'].includes(limit.period)) {
        throw new ConfigError(`${context}: rateLimit.period must be 'second', 'minute', 'hour', or 'day'.`);
    }
    // Validate interval if present
    if (limit.interval !== undefined) {
        if (typeof limit.interval !== 'string' && typeof limit.interval !== 'number') {
            throw new ConfigError(`${context}: rateLimit.interval must be a string (e.g., '10s', '5m') or number (seconds).`);
        }
        if (typeof limit.interval === 'number' && limit.interval <= 0) {
            throw new ConfigError(`${context}: rateLimit.interval (number) must be positive.`);
        }
        if (typeof limit.interval === 'string' && !/^\d+(s|m|h|d)$/.test(limit.interval) && !/^\d+$/.test(limit.interval)) {
            // Allow plain numbers as strings too, interpreting them as seconds
            throw new ConfigError(`${context}: rateLimit.interval string format is invalid (e.g., '10s', '5m', '1h', '1d', or '60').`);
        }
    }
}

function validateArrayOrString(value: any, name: string, context: string): void {
    if (value === undefined) return;
    if (typeof value !== 'string' && !Array.isArray(value)) {
        throw new ConfigError(`${context}: ${name} must be a string or an array of strings.`);
    }
    if (Array.isArray(value) && !value.every(item => typeof item === 'string')) {
        throw new ConfigError(`${context}: All elements in ${name} array must be strings.`);
    }
}

function validateToolAccess(config: Record<string, ToolAccessConfig> | undefined, context: string): void {
    if (config === undefined) return;
    if (typeof config !== 'object' || config === null) {
        throw new ConfigError(`${context}: toolAccess must be an object.`);
    }
    for (const toolName in config) {
        if (Object.prototype.hasOwnProperty.call(config, toolName)) {
            const toolConf = config[toolName];
            const toolContext = `${context}.toolAccess['${toolName}']`;
            if (typeof toolConf !== 'object' || toolConf === null) {
                throw new ConfigError(`${toolContext}: Configuration for tool must be an object.`);
            }
            if (toolConf.allow !== undefined && typeof toolConf.allow !== 'boolean') {
                throw new ConfigError(`${toolContext}: 'allow' must be a boolean.`);
            }
            validateArrayOrString(toolConf.roles, 'roles', toolContext);
            validateArrayOrString(toolConf.scopes, 'scopes', toolContext);
            validateRateLimit(toolConf.rateLimit, toolContext);
            if (toolConf.allowedApiKeys !== undefined) {
                 if (!Array.isArray(toolConf.allowedApiKeys) || !toolConf.allowedApiKeys.every(k => typeof k === 'string')) {
                     throw new ConfigError(`${toolContext}: 'allowedApiKeys' must be an array of strings.`);
                 }
            }
        }
    }
}

function validateRoleConfig(config: Record<string, RoleConfig> | undefined, context: string): void {
    if (config === undefined) return;
     if (typeof config !== 'object' || config === null) {
         throw new ConfigError(`${context}: roles definition must be an object.`);
     }
     for (const roleName in config) {
         if (Object.prototype.hasOwnProperty.call(config, roleName)) {
             const roleConf = config[roleName];
             const roleContext = `${context}.roles['${roleName}']`;
             if (typeof roleConf !== 'object' || roleConf === null) {
                 throw new ConfigError(`${roleContext}: Configuration for role must be an object.`);
             }
             validateArrayOrString(roleConf.allowedTools, 'allowedTools', roleContext);
             if (roleConf.rateLimits !== undefined) {
                 if (typeof roleConf.rateLimits !== 'object' || roleConf.rateLimits === null) {
                      throw new ConfigError(`${roleContext}: 'rateLimits' must be an object.`);
                  }
                  for (const limitKey in roleConf.rateLimits) {
                      if (Object.prototype.hasOwnProperty.call(roleConf.rateLimits, limitKey)) {
                          validateRateLimit(roleConf.rateLimits[limitKey], `${roleContext}.rateLimits['${limitKey}']`);
                      }
                  }
             }
         }
     }
}

function validateUserAuth(config: UserAuthConfig | undefined, context: string): void {
    if (config === undefined) return;
    if (typeof config !== 'object' || config === null) {
        throw new ConfigError(`${context}: userAuthentication must be an object.`);
    }
    if (config.type && !['jwt', 'api-key', 'custom'].includes(config.type)) {
        throw new ConfigError(`${context}: Invalid userAuthentication type '${config.type}'. Valid values: 'jwt', 'api-key', 'custom'.`);
    }
    if (config.jwtSecret && typeof config.jwtSecret !== 'string') {
        throw new ConfigError(`${context}: userAuthentication.jwtSecret must be a string.`);
    }
    if (config.customAuthenticator && typeof config.customAuthenticator !== 'function') {
        throw new ConfigError(`${context}: userAuthentication.customAuthenticator must be a function.`);
    }
    if (config.type === 'jwt' && !config.jwtSecret) {
        logger.warn(`${context}: JWT authentication configured (type='jwt') but 'jwtSecret' is missing. Ensure it's provided via env or updateConfig.`);
    }
}

function validateDangerousArgs(config: DangerousArgumentsConfig | undefined, context: string): void {
    if (config === undefined) return;
     if (typeof config !== 'object' || config === null) {
         throw new ConfigError(`${context}: dangerousArguments must be an object.`);
     }
    const validatePatternsArray = (patterns: any, name: string) => {
        if (patterns !== undefined) {
            if (!Array.isArray(patterns)) throw new ConfigError(`${context}: ${name} must be an array.`);
            if (!patterns.every(p => typeof p === 'string' || p instanceof RegExp)) {
                 throw new ConfigError(`${context}: All elements in ${name} must be strings or RegExp objects.`);
             }
        }
    };
    validatePatternsArray(config.globalPatterns, 'dangerousArguments.globalPatterns');
    validatePatternsArray(config.extendablePatterns, 'dangerousArguments.extendablePatterns');

    if (config.toolSpecificPatterns !== undefined) {
        if (typeof config.toolSpecificPatterns !== 'object' || config.toolSpecificPatterns === null) {
            throw new ConfigError(`${context}: dangerousArguments.toolSpecificPatterns must be an object.`);
        }
        for (const toolName in config.toolSpecificPatterns) {
             if (Object.prototype.hasOwnProperty.call(config.toolSpecificPatterns, toolName)) {
                 validatePatternsArray(config.toolSpecificPatterns[toolName], `dangerousArguments.toolSpecificPatterns['${toolName}']`);
             }
        }
    }
    if (config.blockedValues !== undefined) {
         if (!Array.isArray(config.blockedValues) || !config.blockedValues.every(v => typeof v === 'string')) {
             throw new ConfigError(`${context}: dangerousArguments.blockedValues must be an array of strings.`);
         }
     }
     if (config.auditOnlyMode !== undefined && typeof config.auditOnlyMode !== 'boolean') {
          throw new ConfigError(`${context}: dangerousArguments.auditOnlyMode must be a boolean.`);
      }
     if (config.specificKeyRules !== undefined) {
         if (typeof config.specificKeyRules !== 'object' || config.specificKeyRules === null) {
              throw new ConfigError(`${context}: dangerousArguments.specificKeyRules must be an object.`);
          }
         // Could add deeper validation for specificKeyRules structure if defined
     }
}

function validateSecurityConfig(config: SecurityConfig | undefined, context: string): void {
  if (config === undefined) return;
  if (typeof config !== 'object' || config === null) {
      throw new ConfigError(`${context}: security field must be an object`);
  }
  if (config.defaultPolicy && !['allow-all', 'deny-all'].includes(config.defaultPolicy)) {
      throw new ConfigError(`${context}: Invalid defaultPolicy value: ${config.defaultPolicy}. Valid: 'allow-all', 'deny-all'.`);
  }
  if (config.requireAuthentication !== undefined && typeof config.requireAuthentication !== 'boolean') {
       throw new ConfigError(`${context}: requireAuthentication must be a boolean.`);
   }
   if (config.allowUnauthenticatedAccess !== undefined && typeof config.allowUnauthenticatedAccess !== 'boolean') {
        throw new ConfigError(`${context}: allowUnauthenticatedAccess must be a boolean.`);
    }
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
        throw new ConfigError(`${context}: debug must be a boolean.`);
    }

  // Validate nested structures
  validateUserAuth(config.userAuthentication, `${context}.userAuthentication`);
  validateToolAccess(config.toolAccess, context);
  if (config.roles) {
     if (typeof config.roles !== 'object' || config.roles === null) {
         throw new ConfigError(`${context}.roles: must be an object.`);
     }
     validateRoleConfig(config.roles.roles, `${context}.roles`);
  }
  validateDangerousArgs(config.dangerousArguments, `${context}.dangerousArguments`);

  // Legacy toolConfig validation (minimal)
   if (config.toolConfig !== undefined) {
       if (typeof config.toolConfig !== 'object' || config.toolConfig === null) {
           throw new ConfigError(`${context}: toolConfig must be an object.`);
       }
       // Could add deeper checks if needed
   }
}

export function validateConfig(config: OpenRouterConfig): void {
  if (!config) {
      throw new ConfigError('Configuration missing (config is null or undefined)');
  }
  if (typeof config !== 'object' || config === null) {
       throw new ConfigError('Configuration must be an object');
  }
  if (!config.apiKey || typeof config.apiKey !== 'string') {
    throw new ConfigError('API key (apiKey) is required in configuration and must be a string');
  }
  if (config.apiEndpoint && typeof config.apiEndpoint !== 'string') {
      throw new ConfigError('apiEndpoint must be a string');
  }
   if (config.apiEndpoint && !isValidUrl(config.apiEndpoint)) {
       throw new ConfigError(`Invalid apiEndpoint URL: ${config.apiEndpoint}`);
   }
  if (config.model && typeof config.model !== 'string') {
      throw new ConfigError('model must be a string');
  }
  if (config.proxy) {
      if (typeof config.proxy === 'string') {
          if (!isValidUrl(config.proxy)) {
              throw new ConfigError(`Invalid proxy URL string: ${config.proxy}`);
          }
      } else if (typeof config.proxy === 'object' && config.proxy !== null) {
          if (!config.proxy.host || typeof config.proxy.host !== 'string') {
              throw new ConfigError('When using proxy object, host field (string) is required');
          }

          const port = config.proxy.port;
          let portNum: number | undefined;

          if (port === undefined || port === null) {
               throw new ConfigError('When using proxy object, port field (number or string) is required');
          }

          if (typeof port === 'number') {
              if (!Number.isInteger(port)) {
                  throw new ConfigError('Proxy port must be an integer.');
              }
              portNum = port;
          } else if (typeof port === 'string') {
              if (!/^\d+$/.test(port)) {
                  throw new ConfigError(`Proxy port string must contain only digits, got: "${port}"`);
              }
              portNum = parseInt(port, 10);
              if (isNaN(portNum)) {
                   throw new ConfigError(`Failed to parse proxy port string: "${port}"`);
              }
          } else {
               throw new ConfigError(`Proxy port must be a number or a string, got ${typeof port}`);
          }

          if (portNum < 1 || portNum > 65535) {
              throw new ConfigError(`Proxy port must be between 1 and 65535, got: ${portNum}`);
          }

          if (config.proxy.user && typeof config.proxy.user !== 'string') {
               throw new ConfigError('user field in proxy must be a string');
          }
          if (config.proxy.pass && typeof config.proxy.pass !== 'string') {
               throw new ConfigError('pass field in proxy must be a string');
          }
      } else {
          throw new ConfigError('Invalid proxy format. Expected string (URL) or object { host, port, ... }');
      }
  }

  if (config.modelFallbacks && !Array.isArray(config.modelFallbacks)) {
      throw new ConfigError('modelFallbacks must be an array of strings');
  }
   if (config.modelFallbacks && !config.modelFallbacks.every(m => typeof m === 'string')) {
       throw new ConfigError('Each element in modelFallbacks must be a string');
   }

  if (config.historyStorage && !['memory', 'disk'].includes(config.historyStorage)) {
      throw new ConfigError(`Invalid historyStorage type: ${config.historyStorage}. Valid values: 'memory', 'disk'`);
  }

   if (config.historyTtl !== undefined && (typeof config.historyTtl !== 'number' || config.historyTtl <= 0)) {
       throw new ConfigError('historyTtl must be a positive number (milliseconds)');
   }
   if (config.historyCleanupInterval !== undefined && (typeof config.historyCleanupInterval !== 'number' || config.historyCleanupInterval <= 0)) {
        throw new ConfigError('historyCleanupInterval must be a positive number (milliseconds)');
    }
    if (config.historyAutoSave !== undefined && typeof config.historyAutoSave !== 'boolean') {
         throw new ConfigError('historyAutoSave must be a boolean.');
     }

  if (config.responseFormat) {
      if (typeof config.responseFormat !== 'object' || config.responseFormat === null) {
          throw new ConfigError('responseFormat must be an object');
      }
      if (!['json_object', 'json_schema'].includes(config.responseFormat.type)) {
           throw new ConfigError(`Invalid responseFormat type: ${config.responseFormat.type}. Valid values: 'json_object', 'json_schema'`);
      }
      if (config.responseFormat.type === 'json_schema') {
          if (!config.responseFormat.json_schema) {
               throw new ConfigError("For responseFormat type 'json_schema', 'json_schema' field is required");
          }
          if (typeof config.responseFormat.json_schema !== 'object' || config.responseFormat.json_schema === null) {
               throw new ConfigError("responseFormat.json_schema must be an object");
          }
           if (typeof config.responseFormat.json_schema.name !== 'string' || !config.responseFormat.json_schema.name) {
                throw new ConfigError("responseFormat.json_schema.name (string) is required");
           }
           if (typeof config.responseFormat.json_schema.schema !== 'object' || config.responseFormat.json_schema.schema === null) {
               throw new ConfigError("responseFormat.json_schema.schema (JSON Schema object) is required");
           }
            if (config.responseFormat.json_schema.strict !== undefined && typeof config.responseFormat.json_schema.strict !== 'boolean') {
                throw new ConfigError("responseFormat.json_schema.strict must be a boolean if provided.");
            }
      }
  }

  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
       throw new ConfigError('debug must be a boolean.');
   }
   if (config.strictJsonParsing !== undefined && typeof config.strictJsonParsing !== 'boolean') {
        throw new ConfigError('strictJsonParsing must be a boolean.');
    }
   if (config.referer && typeof config.referer !== 'string') {
       throw new ConfigError('referer must be a string.');
   }
   if (config.title && typeof config.title !== 'string') {
        throw new ConfigError('title must be a string.');
    }
   if (config.providerPreferences && (typeof config.providerPreferences !== 'object' || config.providerPreferences === null)) {
        throw new ConfigError('providerPreferences must be an object.');
    }
   if (config.axiosConfig && (typeof config.axiosConfig !== 'object' || config.axiosConfig === null)) {
       throw new ConfigError('axiosConfig must be an Axios configuration object');
   }

  // Validate the security section
  validateSecurityConfig(config.security, 'config');
}