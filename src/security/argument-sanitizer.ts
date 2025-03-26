// Path: security/argument-sanitizer.ts
import { IArgumentSanitizer, SecurityContext, ISecurityEventEmitter } from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { SecurityError } from '../utils/error';

export class ArgumentSanitizer implements IArgumentSanitizer {
  private eventEmitter: ISecurityEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  // A list of globally dangerous patterns to check against string arguments.
  // These cover common command injection, file system manipulation, XSS, SQL injection, etc.
  private globalDangerousPatterns: RegExp[] = [
    /rm\s+-rf\s+[\/~]/i, // Dangerous rm command
    /(^|\s)format\s+[a-z]:/i, // Formatting drives
    /(^|\s)mkfs/i, // Filesystem creation
    /(^|\s)dd\s+if=/i, // Low-level disk copy
    /(^|\s)eval\(/i, // JS eval
    /(^|\s)exec\(/i, // JS exec
    /new\s+Function\(/i, // JS Function constructor
    /setTimeout\s*\(\s*['"`].*['"`]\s*\)/i, // String-based setTimeout
    /setInterval\s*\(\s*['"`].*['"`]\s*\)/i, // String-based setInterval
    /process\.(env|exit|kill|memoryUsage|cpuUsage)/i, // Node.js process access
    /require\s*\(\s*['"`](child_process|vm|worker_threads|os|fs)['"`]\s*\)/i, // Dangerous Node.js require
    /\.\s*fs\s*\.\s*(write|append|unlink|rm|mkdir|rmdir|chmod|chown)/i, // Direct fs manipulation via properties
    /(--|#|\/\*|\*\/|;)\s*(drop|delete|insert|update|union|select)/i, // Basic SQL injection patterns
    /' OR '1'='1/i, // Classic SQL injection
    /<script[\s>]/i, // HTML script tag
    /onerror\s*=/i, // JS error handlers
    /onload\s*=/i, // JS load handlers
    /javascript:/i, // javascript: protocol
    /\.\.\//, /%2e%2e%2f/i, /%2e%2e\//i, // Directory traversal
    /\.\.%5c/i, /%2e%2e%5c/i, // Directory traversal (Windows/URL encoded)
  ];

  constructor(eventEmitter: ISecurityEventEmitter, logger: Logger) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  async validateArguments(tool: Tool, args: any, context: SecurityContext): Promise<void> {
    const toolName = context.toolName || 'unknown tool';
    if (args === null || args === undefined) {
      // Arguments for ... are missing, validation skipped.
      this.logger.debug(`Arguments for ${toolName} are missing, validation skipped.`);
      return;
    }
    // Validating arguments for ...
    this.logger.debug(`Validating arguments for ${toolName}`);

    // Safely access configuration, providing defaults if necessary
    const extConfig = (context.config || {}) as Record<string, any>;
    const dangerousArgsConfig = extConfig.dangerousArguments || {};
    const toolSpecificPatterns = this.getToolDangerousPatterns(tool, context);
    const globalBlockedValues: string[] = Array.isArray(dangerousArgsConfig.blockedValues) ? dangerousArgsConfig.blockedValues : [];
    const allPatterns = [...this.globalDangerousPatterns, ...toolSpecificPatterns];
    const violations: string[] = [];

    // Recursive function to check values within nested objects and arrays
    const checkValue = (value: any, path: string): void => {
        if (value === null || value === undefined) return;

        // Check against globally blocked substrings
        if (typeof value === 'string' && globalBlockedValues.some((blocked: string) => value.includes(blocked))) {
            // Blocked value found in '...'
            violations.push(`Blocked value found in '${path}': ${value}`);
        }
        // Check against all dangerous patterns (global + tool-specific)
        if (typeof value === 'string') {
            for (const pattern of allPatterns) {
                if (pattern.test(value)) {
                    // Dangerous pattern (...) found in '...'
                    violations.push(`Dangerous pattern (${pattern.source}) found in '${path}': ${value.substring(0, 100)}...`);
                }
            }
        }

        // Placeholder for potential future specific key rules
        const keyName = path.split('.').pop() || path;
        const keySpecificRules = dangerousArgsConfig.specificKeyRules?.[keyName];
        if (keySpecificRules) { /* Validation logic for specific keys */ }

        // Recurse into objects and arrays
        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
            } else {
                // Iterate over object properties
                Object.entries(value).forEach(([key, subValue]) => checkValue(subValue, `${path ? path + '.' : ''}${key}`));
            }
        }
    };

    // Start the recursive check from the root arguments object
    checkValue(args, '');

    // Handle violations if any were found
    if (violations.length > 0) {
       // Dangerous arguments detected for '...'
       this.logger.warn(`Dangerous arguments detected for '${toolName}':`, violations);
      this.eventEmitter.emit('security:dangerous_args', { toolName, userId: context.userId, violations, args });
      // Throw an error unless in debug mode
      if (!context.debug) {
        // Dangerous arguments detected for ...
        throw new SecurityError(`Dangerous arguments detected for ${toolName}: ${violations.join('; ')}`, 'DANGEROUS_ARGS', 400, { violations });
      } else {
           // Debug mode: dangerous arguments error not thrown.
           this.logger.log("Debug mode: dangerous arguments error not thrown.");
      }
    } else {
        // Argument validation for ... passed successfully.
        this.logger.debug(`Argument validation for ${toolName} passed successfully.`);
    }
  }

  /**
   * Retrieves tool-specific dangerous patterns from the configuration.
   * @param tool - The tool definition.
   * @param context - The security context containing configuration.
   * @returns An array of RegExp patterns specific to the tool.
   * @private
   */
  private getToolDangerousPatterns(tool: Tool, context: SecurityContext): RegExp[] {
    const toolName = context.toolName;
    const extConfig = (context.config || {}) as Record<string, any>;

    // Look for patterns in dangerousArguments.toolSpecificPatterns first, then fallback to toolConfig (legacy)
    const toolSpecificPatternsConfig = extConfig.dangerousArguments?.toolSpecificPatterns?.[toolName || '']
                                    || extConfig.toolConfig?.[toolName || '']?.dangerousPatterns;

    if (!toolSpecificPatternsConfig || !Array.isArray(toolSpecificPatternsConfig)) return [];

    const patterns: RegExp[] = [];
    toolSpecificPatternsConfig.forEach((patternSource: string | RegExp) => {
        if (patternSource instanceof RegExp) {
            patterns.push(patternSource);
        } else if (typeof patternSource === 'string') {
            try {
                // Attempt to create RegExp from string, supporting /pattern/flags format
                const match = patternSource.match(/^\/(.+)\/([gimyus]*)$/);
                const regex = match ? new RegExp(match[1], match[2]) : new RegExp(patternSource);
                patterns.push(regex);
            } catch (error) {
                // Error compiling RegExp for '...' from pattern: ...
                this.logger.error(`Error compiling RegExp for '${toolName}' from pattern: ${patternSource}`, error);
                this.eventEmitter.emit('security:pattern_error', { toolName, pattern: patternSource, error });
            }
        }
    });
    // Loaded ... specific patterns for '...'
    this.logger.debug(`Loaded ${patterns.length} specific patterns for '${toolName}'`);
    return patterns;
  }

  destroy(): void {
      // ArgumentSanitizer destroyed.
      this.logger.log("ArgumentSanitizer destroyed.");
  }
}