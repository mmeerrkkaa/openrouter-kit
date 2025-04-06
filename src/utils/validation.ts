// Path: src/utils/validation.ts
import { ConfigError } from './error';
// Import the EXTENDED RateLimit type from security/types
import { ExtendedRateLimit } from '../security/types';
// Import base types from the main types index
import {
    OpenRouterConfig,
    SecurityConfig as BaseSecurityConfig, // Use Base prefix
    ToolAccessConfig as BaseToolAccessConfig, // Use Base prefix
    RoleConfig as BaseRoleConfig, // Use Base prefix
    UserAuthConfig as BaseUserAuthConfig, // Use Base prefix
    DangerousArgumentsConfig as BaseDangerousArgumentsConfig, // Use Base prefix
    ResponseFormat,
    HistoryStorageType
} from '../types';
import { Logger } from './logger';

// Define local types based on the extended security types if needed for validation logic
type RateLimit = ExtendedRateLimit;
// Use the extended types from security/types for validation functions
type SecurityConfig = import('../security/types').ExtendedSecurityConfig;
type DangerousArgumentsConfig = import('../security/types').ExtendedDangerousArgumentsConfig;


const logger = new Logger({ debug: false, prefix: 'Validation' });

function isValidUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') {
      return false;
  }
  try {
    const parsedUrl = new URL(urlString);
    const protocol = parsedUrl.protocol.toLowerCase();
    return ['http:', 'https:', 'ws:', 'wss:'].includes(protocol);
  } catch (e) {
    return false;
  }
}

// Accept the extended RateLimit type for validation
function validateRateLimit(limit: RateLimit | undefined, context: string): void {
    if (limit === undefined) return;
    if (typeof limit !== 'object' || limit === null) {
        throw new ConfigError(`${context}: rateLimit must be an object.`);
    }
    if (typeof limit.limit !== 'number' || !Number.isInteger(limit.limit) || limit.limit <= 0) {
        throw new ConfigError(`${context}: rateLimit.limit must be a positive integer.`);
    }

    const hasPeriod = limit.period && ['second', 'minute', 'hour', 'day'].includes(limit.period);
    // Check the 'interval' property which exists on the ExtendedRateLimit type
    const hasInterval = limit.interval !== undefined;

    if (!hasPeriod && !hasInterval) {
         throw new ConfigError(`${context}: rateLimit must define either 'period' ('second', 'minute', 'hour', 'day') or 'interval' (string/number).`);
    }
    if (hasPeriod && !['second', 'minute', 'hour', 'day'].includes(limit.period)) {
         throw new ConfigError(`${context}: rateLimit.period must be 'second', 'minute', 'hour', or 'day'.`);
     }

    if (hasInterval) {
        if (typeof limit.interval === 'number') {
            if (limit.interval <= 0) {
                throw new ConfigError(`${context}: rateLimit.interval (number) must be positive (representing seconds).`);
            }
        } else if (typeof limit.interval === 'string') {
            if (!/^\d+$/.test(limit.interval) && !/^\d+(s|m|h|d)$/.test(limit.interval)) {
                throw new ConfigError(`${context}: rateLimit.interval string format is invalid (e.g., '60', '10s', '5m', '1h', '1d').`);
            }
        } else {
            throw new ConfigError(`${context}: rateLimit.interval must be a string (e.g., '10s') or number (seconds).`);
        }
    }
}

function validateArrayOrString(value: any, name: string, context: string): void {
    if (value === undefined) return;
    if (typeof value !== 'string' && !Array.isArray(value)) {
        throw new ConfigError(`${context}: ${name} must be a string or an array of strings.`);
    }
    if (Array.isArray(value) && !value.every((item: any) => typeof item === 'string')) {
        throw new ConfigError(`${context}: All elements in the ${name} array must be non-empty strings.`);
    }
}

// Use the base ToolAccessConfig type for validation input parameter
function validateToolAccess(config: Record<string, BaseToolAccessConfig> | undefined, context: string): void {
    if (config === undefined) return;
    if (typeof config !== 'object' || config === null) {
        throw new ConfigError(`${context}: toolAccess must be an object.`);
    }
    for (const toolName in config) {
        if (Object.prototype.hasOwnProperty.call(config, toolName)) {
            const toolConf = config[toolName];
            const toolContext = `${context}.toolAccess['${toolName}']`;
            if (typeof toolConf !== 'object' || toolConf === null) {
                throw new ConfigError(`${toolContext}: Configuration must be an object.`);
            }
            if (toolConf.allow !== undefined && typeof toolConf.allow !== 'boolean') {
                throw new ConfigError(`${toolContext}: 'allow' must be a boolean if provided.`);
            }
            validateArrayOrString(toolConf.roles, 'roles', toolContext);
            validateArrayOrString(toolConf.scopes, 'scopes', toolContext);
            // Cast to ExtendedRateLimit for validation function
            validateRateLimit(toolConf.rateLimit as RateLimit | undefined, toolContext);
            if (toolConf.allowedApiKeys !== undefined) {
                 if (!Array.isArray(toolConf.allowedApiKeys) || !toolConf.allowedApiKeys.every((k: any) => typeof k === 'string')) {
                     throw new ConfigError(`${toolContext}: 'allowedApiKeys' must be an array of strings if provided.`);
                 }
            }
        }
    }
}

// Use the base RoleConfig type for validation input parameter
function validateRoleConfig(config: Record<string, BaseRoleConfig> | undefined, context: string): void {
    if (config === undefined) return;
     if (typeof config !== 'object' || config === null) {
         throw new ConfigError(`${context}: Role definitions (roles.roles) must be an object.`);
     }
     for (const roleName in config) {
         if (Object.prototype.hasOwnProperty.call(config, roleName)) {
             const roleConf = config[roleName];
             const roleContext = `${context}['${roleName}']`;
             if (typeof roleConf !== 'object' || roleConf === null) {
                 throw new ConfigError(`${roleContext}: Configuration for role must be an object.`);
             }
             validateArrayOrString(roleConf.allowedTools, 'allowedTools', roleContext);
             if (roleConf.rateLimits !== undefined) {
                 if (typeof roleConf.rateLimits !== 'object' || roleConf.rateLimits === null) {
                      throw new ConfigError(`${roleContext}: 'rateLimits' must be an object if provided.`);
                  }
                  for (const limitKey in roleConf.rateLimits) {
                      if (Object.prototype.hasOwnProperty.call(roleConf.rateLimits, limitKey)) {
                          // Cast to ExtendedRateLimit for validation function
                          validateRateLimit(roleConf.rateLimits[limitKey] as RateLimit | undefined, `${roleContext}.rateLimits['${limitKey}']`);
                      }
                  }
             }
         }
     }
}

// Use the base UserAuthConfig type for validation input parameter
function validateUserAuth(config: BaseUserAuthConfig | undefined, context: string): void {
    if (config === undefined) return;
    if (typeof config !== 'object' || config === null) {
        throw new ConfigError(`${context}: userAuthentication must be an object.`);
    }
    if (config.type && !['jwt', 'api-key', 'custom'].includes(config.type)) {
        throw new ConfigError(`${context}: Invalid userAuthentication.type '${config.type}'. Valid values: 'jwt', 'api-key', 'custom'.`);
    }
    if (config.jwtSecret !== undefined && typeof config.jwtSecret !== 'string') {
        throw new ConfigError(`${context}: userAuthentication.jwtSecret must be a string if provided.`);
    }
    if (config.customAuthenticator !== undefined && typeof config.customAuthenticator !== 'function') {
        throw new ConfigError(`${context}: userAuthentication.customAuthenticator must be a function if provided.`);
    }
    if (config.type === 'jwt' && !config.jwtSecret) {
        logger.warn(`${context}: JWT authentication configured (type='jwt') but 'jwtSecret' is missing in the config object. Ensure it's provided via environment variable (JWT_SECRET) or updated later if needed.`);
    }
     if (config.type === 'custom' && !config.customAuthenticator) {
         logger.error(`${context}: Custom authentication configured (type='custom') but 'customAuthenticator' function is missing.`);
         throw new ConfigError(`${context}: userAuthentication.customAuthenticator function is required when type is 'custom'.`);
     }
}

// Use the extended DangerousArgumentsConfig type for validation
function validateDangerousArgs(config: DangerousArgumentsConfig | undefined, context: string): void {
    if (config === undefined) return;
     if (typeof config !== 'object' || config === null) {
         throw new ConfigError(`${context}: dangerousArguments must be an object.`);
     }
    const validatePatternsArray = (patterns: any, name: string, ctx: string) => {
        if (patterns !== undefined) {
            if (!Array.isArray(patterns)) throw new ConfigError(`${ctx}: ${name} must be an array.`);
            if (!patterns.every((p: any) => typeof p === 'string' || p instanceof RegExp)) {
                 throw new ConfigError(`${ctx}: All elements in ${name} must be strings or RegExp objects.`);
             }
        }
    };
    validatePatternsArray(config.globalPatterns, 'globalPatterns', context);
    validatePatternsArray(config.extendablePatterns, 'extendablePatterns', context);

    if (config.toolSpecificPatterns !== undefined) {
        if (typeof config.toolSpecificPatterns !== 'object' || config.toolSpecificPatterns === null) {
            throw new ConfigError(`${context}: dangerousArguments.toolSpecificPatterns must be an object.`);
        }
        for (const toolName in config.toolSpecificPatterns) {
             if (Object.prototype.hasOwnProperty.call(config.toolSpecificPatterns, toolName)) {
                 validatePatternsArray(
                     config.toolSpecificPatterns[toolName],
                     `patterns for tool '${toolName}'`,
                     `${context}.toolSpecificPatterns`
                 );
             }
        }
    }
    if (config.blockedValues !== undefined) {
         if (!Array.isArray(config.blockedValues) || !config.blockedValues.every((v: any) => typeof v === 'string')) {
             throw new ConfigError(`${context}: dangerousArguments.blockedValues must be an array of strings if provided.`);
         }
     }
     if (config.auditOnlyMode !== undefined && typeof config.auditOnlyMode !== 'boolean') {
          throw new ConfigError(`${context}: dangerousArguments.auditOnlyMode must be a boolean if provided.`);
      }
     if (config.specificKeyRules !== undefined) {
         if (typeof config.specificKeyRules !== 'object' || config.specificKeyRules === null) {
              throw new ConfigError(`${context}: dangerousArguments.specificKeyRules must be an object if provided.`);
          }
     }
}

// Use the extended SecurityConfig type for validation
function validateSecurityConfig(config: SecurityConfig | undefined, context: string): void {
  if (config === undefined) return;
  if (typeof config !== 'object' || config === null) {
      throw new ConfigError(`${context}: security configuration must be an object if provided.`);
  }
  if (config.defaultPolicy && !['allow-all', 'deny-all'].includes(config.defaultPolicy)) {
      throw new ConfigError(`${context}: Invalid security.defaultPolicy value: '${config.defaultPolicy}'. Must be 'allow-all' or 'deny-all'.`);
  }
  if (config.requireAuthentication !== undefined && typeof config.requireAuthentication !== 'boolean') {
       throw new ConfigError(`${context}: security.requireAuthentication must be a boolean if provided.`);
   }
   if (config.allowUnauthenticatedAccess !== undefined && typeof config.allowUnauthenticatedAccess !== 'boolean') {
        throw new ConfigError(`${context}: security.allowUnauthenticatedAccess must be a boolean if provided.`);
    }
  // config.debug is now guaranteed boolean by the type
  // if (config.debug !== undefined && typeof config.debug !== 'boolean') {
  //      throw new ConfigError(`${context}: security.debug must be a boolean if provided.`);
  //  }

  validateUserAuth(config.userAuthentication, `${context}.userAuthentication`);
  validateToolAccess(config.toolAccess, context);
  if (config.roles) {
     if (typeof config.roles !== 'object' || config.roles === null) {
         throw new ConfigError(`${context}.roles: must be an object if provided.`);
     }
     validateRoleConfig(config.roles.roles, `${context}.roles.roles`);
  }
  validateDangerousArgs(config.dangerousArguments, `${context}.dangerousArguments`);

   if (config.toolConfig !== undefined) {
        logger.warn(`${context}: Found legacy 'toolConfig' field. Prefer using 'security.dangerousArguments.toolSpecificPatterns' for defining dangerous patterns.`);
       if (typeof config.toolConfig !== 'object' || config.toolConfig === null) {
           throw new ConfigError(`${context}: security.toolConfig must be an object if provided.`);
       }
   }
}

export function validateConfig(config: OpenRouterConfig): void {
  if (!config) {
      throw new ConfigError('Configuration object is missing (null or undefined).');
  }
  if (typeof config !== 'object' || config === null) {
       throw new ConfigError('Configuration must be provided as an object.');
  }
  if (!config.apiKey || typeof config.apiKey !== 'string') {
    throw new ConfigError('API key (apiKey) is required in configuration and must be a non-empty string.');
  }

  if (config.apiEndpoint !== undefined) {
      if (typeof config.apiEndpoint !== 'string') throw new ConfigError('apiEndpoint must be a string if provided.');
      if (!isValidUrl(config.apiEndpoint)) throw new ConfigError(`Invalid apiEndpoint URL format: ${config.apiEndpoint}`);
  }
  if (config.model !== undefined && typeof config.model !== 'string') {
      throw new ConfigError('model must be a string if provided.');
  }
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
       throw new ConfigError('debug must be a boolean if provided.');
   }
   if (config.referer !== undefined && typeof config.referer !== 'string') {
       throw new ConfigError('referer must be a string if provided.');
   }
   if (config.title !== undefined && typeof config.title !== 'string') {
        throw new ConfigError('title must be a string if provided.');
    }
   if (config.strictJsonParsing !== undefined && typeof config.strictJsonParsing !== 'boolean') {
        throw new ConfigError('strictJsonParsing must be a boolean if provided.');
    }
   if (config.enableCostTracking !== undefined && typeof config.enableCostTracking !== 'boolean') {
        throw new ConfigError('enableCostTracking must be a boolean if provided.');
    }
   if (config.priceRefreshIntervalMs !== undefined && (typeof config.priceRefreshIntervalMs !== 'number' || config.priceRefreshIntervalMs <= 0)) {
       throw new ConfigError('priceRefreshIntervalMs must be a positive number (milliseconds) if provided.');
   }
    if (config.initialModelPrices !== undefined && (typeof config.initialModelPrices !== 'object' || config.initialModelPrices === null)) {
        throw new ConfigError('initialModelPrices must be an object (Record<string, ModelPricingInfo>) if provided.');
    }

  if (config.proxy) {
      if (typeof config.proxy === 'string') {
          if (!isValidUrl(config.proxy)) {
              throw new ConfigError(`Invalid proxy URL string format: ${config.proxy}`);
          }
      } else if (typeof config.proxy === 'object' && config.proxy !== null) {
          if (!config.proxy.host || typeof config.proxy.host !== 'string') {
              throw new ConfigError('Proxy object requires a non-empty string "host" field.');
          }
          const port = config.proxy.port;
          if (port === undefined || port === null) {
               throw new ConfigError('Proxy object requires a "port" field (number or string).');
          }
          let portNum: number | undefined;
          if (typeof port === 'number') {
              if (!Number.isInteger(port)) throw new ConfigError('Proxy port number must be an integer.');
              portNum = port;
          } else if (typeof port === 'string') {
              if (!/^\d+$/.test(port)) throw new ConfigError(`Proxy port string must contain only digits, got: "${port}"`);
              portNum = parseInt(port, 10);
              if (isNaN(portNum)) throw new ConfigError(`Failed to parse proxy port string: "${port}"`);
          } else {
               throw new ConfigError(`Proxy port must be a number or a string, got type ${typeof port}`);
          }
          if (portNum < 1 || portNum > 65535) {
              throw new ConfigError(`Proxy port number must be between 1 and 65535, got: ${portNum}`);
          }
          if (config.proxy.user !== undefined && typeof config.proxy.user !== 'string') {
               throw new ConfigError('Proxy user must be a string if provided.');
          }
          if (config.proxy.pass !== undefined && typeof config.proxy.pass !== 'string') {
               throw new ConfigError('Proxy pass must be a string if provided.');
          }
      } else {
          throw new ConfigError('Invalid proxy format. Expected a URL string or an object { host, port, ... }.');
      }
  }

  if (config.modelFallbacks !== undefined) {
      if (!Array.isArray(config.modelFallbacks)) throw new ConfigError('modelFallbacks must be an array if provided.');
      if (!config.modelFallbacks.every((m: any) => typeof m === 'string' && m.length > 0)) {
          throw new ConfigError('Each element in modelFallbacks must be a non-empty string.');
      }
  }

   if (config.historyAdapter !== undefined) {
       if (typeof config.historyAdapter !== 'object' || config.historyAdapter === null ||
           typeof config.historyAdapter.load !== 'function' ||
           typeof config.historyAdapter.save !== 'function' ||
           typeof config.historyAdapter.delete !== 'function' ||
           typeof config.historyAdapter.listKeys !== 'function') {
           throw new ConfigError('Invalid historyAdapter provided. It must be an object implementing the IHistoryStorage interface.');
       }
   }
   if (config.historyStorage !== undefined && !['memory', 'disk'].includes(config.historyStorage)) {
       logger.warn(`Legacy 'historyStorage' field is deprecated. Use 'historyAdapter' instead. Invalid value ignored: ${config.historyStorage}`);
   }
   if (config.chatsFolder !== undefined && typeof config.chatsFolder !== 'string') {
        logger.warn(`Legacy 'chatsFolder' field is deprecated. Configure path within your DiskHistoryStorage adapter. Invalid value ignored.`);
   }
   if (config.historyTtl !== undefined && (typeof config.historyTtl !== 'number' || config.historyTtl <= 0)) {
       throw new ConfigError('historyTtl (for cache) must be a positive number (milliseconds) if provided.');
   }
   if (config.historyCleanupInterval !== undefined && (typeof config.historyCleanupInterval !== 'number' || config.historyCleanupInterval <= 0)) {
        throw new ConfigError('historyCleanupInterval (for cache) must be a positive number (milliseconds) if provided.');
    }
    if (config.maxHistoryEntries !== undefined) logger.warn(`'maxHistoryEntries' config is deprecated. Limit handling depends on the history adapter or UnifiedHistoryManager configuration.`);
    if (config.historyAutoSave !== undefined) logger.warn(`'historyAutoSave' config is deprecated. Auto-saving depends on the history adapter implementation.`);


  if (config.responseFormat) {
      const rf = config.responseFormat;
      if (typeof rf !== 'object' || rf === null) throw new ConfigError('responseFormat must be an object if provided.');
      if (!rf.type || !['json_object', 'json_schema'].includes(rf.type)) {
           throw new ConfigError(`Invalid responseFormat.type: '${rf.type}'. Must be 'json_object' or 'json_schema'.`);
      }
      if (rf.type === 'json_schema') {
          if (!rf.json_schema) throw new ConfigError("responseFormat.json_schema field is required when type is 'json_schema'.");
          if (typeof rf.json_schema !== 'object' || rf.json_schema === null) throw new ConfigError("responseFormat.json_schema must be an object.");
          if (typeof rf.json_schema.name !== 'string' || !rf.json_schema.name) throw new ConfigError("responseFormat.json_schema.name (string) is required.");
          if (typeof rf.json_schema.schema !== 'object' || rf.json_schema.schema === null) throw new ConfigError("responseFormat.json_schema.schema (JSON Schema object) is required.");
          if (rf.json_schema.strict !== undefined && typeof rf.json_schema.strict !== 'boolean') throw new ConfigError("responseFormat.json_schema.strict must be a boolean if provided.");
          if (rf.json_schema.description !== undefined && typeof rf.json_schema.description !== 'string') throw new ConfigError("responseFormat.json_schema.description must be a string if provided.");
      }
  }

   if (config.axiosConfig !== undefined && (typeof config.axiosConfig !== 'object' || config.axiosConfig === null)) {
       throw new ConfigError('axiosConfig must be an Axios configuration object if provided.');
   }
    if (config.axiosConfig?.headers) {
        if (typeof config.axiosConfig.headers !== 'object' || config.axiosConfig.headers === null) {
             throw new ConfigError('axiosConfig.headers must be an object if provided.');
         }
        const lowerCaseHeaders = Object.keys(config.axiosConfig.headers).map(h => h.toLowerCase());
        if (lowerCaseHeaders.includes('authorization')) logger.warn("axiosConfig.headers contains 'Authorization'. This will be overridden by the client's apiKey.");
        if (lowerCaseHeaders.includes('content-type')) logger.warn("axiosConfig.headers contains 'Content-Type'. This will be overridden by the client (set to 'application/json').");
    }

   if (config.maxToolCalls !== undefined && (typeof config.maxToolCalls !== 'number' || !Number.isInteger(config.maxToolCalls) || config.maxToolCalls < 0)) {
        throw new ConfigError('maxToolCalls must be a non-negative integer if provided.');
    }

   if (config.providerPreferences !== undefined && (typeof config.providerPreferences !== 'object' || config.providerPreferences === null)) {
        throw new ConfigError('providerPreferences must be an object if provided.');
    }

  // Validate the Security section using the extended SecurityConfig type
  validateSecurityConfig(config.security as SecurityConfig | undefined, 'config.security');

  if (config.enableReasoning !== undefined) logger.warn("'enableReasoning' config option is not standard and may be ignored.");
  if (config.webSearch !== undefined) logger.warn("'webSearch' config option is not standard and may be ignored.");

  logger.debug("Configuration validation passed.");
}