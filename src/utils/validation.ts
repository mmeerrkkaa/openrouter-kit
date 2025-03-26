// Path: utils/validation.ts
/**
 * Validation utilities for OpenRouter
 */

import { ConfigError } from './error';
import { OpenRouterConfig } from '../types';
import { Logger } from './logger';

const logger = new Logger({ debug: false, prefix: 'Validation' });

/**
 * Validates OpenRouter configuration.
 *
 * @param config - Configuration to validate.
 * @throws {ConfigError} If configuration is missing or invalid.
 * @example
 * try {
 *   validateConfig({ apiKey: 'YOUR_API_KEY' });
 *   console.log('Config is valid');
 * } catch (error) {
 *   console.error('Config validation failed:', error.message);
 * }
 */
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

          // --- UPDATED PORT VALIDATION ---
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
              if (!/^\d+$/.test(port)) { // Check if string contains only digits
                  throw new ConfigError(`Proxy port string must contain only digits, got: "${port}"`);
              }
              portNum = parseInt(port, 10);
              if (isNaN(portNum)) {
                   // Should not happen if regex passed, but belt-and-suspenders
                   throw new ConfigError(`Failed to parse proxy port string: "${port}"`);
              }
          } else {
               throw new ConfigError(`Proxy port must be a number or a string, got ${typeof port}`);
          }

          // Check port range
          if (portNum < 1 || portNum > 65535) {
              throw new ConfigError(`Proxy port must be between 1 and 65535, got: ${portNum}`);
          }
          // --- END OF UPDATED PORT VALIDATION ---


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

  if (config.responseFormat) {
      if (typeof config.responseFormat !== 'object' || config.responseFormat === null) {
          throw new ConfigError('responseFormat must be an object');
      }
      if (!['json_object', 'json_schema'].includes(config.responseFormat.type)) {
           throw new ConfigError(`Invalid responseFormat type: ${config.responseFormat.type}. Valid values: 'json_object', 'json_schema'`);
      }
      if (config.responseFormat.type === 'json_schema' && (!config.responseFormat.json_schema || typeof config.responseFormat.json_schema.schema !== 'object')) {
           throw new ConfigError("For responseFormat type 'json_schema', 'json_schema.schema' field (object) is required");
      }
  }

  if (config.security) {
      if (typeof config.security !== 'object' || config.security === null) {
          throw new ConfigError('security field in configuration must be an object');
      }
      if (config.security.defaultPolicy && !['allow-all', 'deny-all'].includes(config.security.defaultPolicy)) {
          throw new ConfigError(`Invalid defaultPolicy value in security: ${config.security.defaultPolicy}`);
      }
      if (config.security.userAuthentication?.type === 'jwt' && !config.security.userAuthentication?.jwtSecret) {
          // Log warning but don't throw error as secret might be provided later or via env
          logger.warn('JWT authentication detected without jwtSecret in configuration. Make sure the secret is set otherwise (via env or updateConfig).');
      }
      // TODO: Add deeper validation of SecurityConfig structure if needed
  }

  if (config.axiosConfig && (typeof config.axiosConfig !== 'object' || config.axiosConfig === null)) {
       throw new ConfigError('axiosConfig must be an Axios configuration object');
   }
}

/**
 * Validates URL (checks basic correctness and http/https/ws/wss protocols).
 *
 * @param urlString - URL string to check.
 * @returns true if URL appears valid, false otherwise.
 * @example
 * isValidUrl('https://openrouter.ai'); // true
 * isValidUrl('http://localhost:8080'); // true
 * isValidUrl('ftp://example.com'); // false
 * isValidUrl('not a url'); // false
 * isValidUrl('/api/v1'); // false (relative paths considered invalid URLs in this context)
 */
export function isValidUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') {
      return false;
  }
  try {
    // Use URL constructor for basic syntax checking
    // Add base only if not an absolute URL, to check relative paths,
    // but we'll reject them if they don't start with expected protocols.
    const baseUrl = urlString.includes(':') ? undefined : 'http://base.example';
    const parsedUrl = new URL(urlString, baseUrl);

    // Check that protocol is one of allowed ones (for absolute URLs)
    // or that protocol is missing (if we provided base, meaning it was a relative path)
    // Relative paths considered invalid in this context
    const protocol = parsedUrl.protocol.toLowerCase();
    return ['http:', 'https:', 'ws:', 'wss:'].includes(protocol);

  } catch (e) {
    // Error parsing URL with constructor
    return false;
  }
}