// Path: security/argument-sanitizer.ts
import { IArgumentSanitizer, SecurityContext, DangerousArgumentsConfig } from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { SecurityError } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

export class ArgumentSanitizer implements IArgumentSanitizer {
  private eventEmitter: SimpleEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  private globalDangerousPatterns: RegExp[] = [
    /rm\s+-rf\s+[\/~]/i,
    /(^|\s)format\s+[a-z]:/i,
    /(^|\s)mkfs/i,
    /(^|\s)dd\s+if=/i,
    /(^|\s)eval\(/i,
    /(^|\s)exec\(/i,
    /new\s+Function\(/i,
    /setTimeout\s*\(\s*['"`].*['"`]\s*\)/i,
    /setInterval\s*\(\s*['"`].*['"`]\s*\)/i,
    /process\.(env|exit|kill|memoryUsage|cpuUsage)/i,
    /require\s*\(\s*['"`](child_process|vm|worker_threads|os|fs)['"`]\s*\)/i,
    /\.\s*fs\s*\.\s*(write|append|unlink|rm|mkdir|rmdir|chmod|chown)/i,
    /(--|#|\/\*|\*\/|;)\s*(drop|delete|insert|update|union|select)/i,
    /' OR '1'='1/i,
    /<script[\s>]/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /javascript:/i,
    /\.\.\//, /%2e%2e%2f/i, /%2e%2e\//i,
    /\.\.%5c/i, /%2e%2e%5c/i,
  ];

  constructor(eventEmitter: SimpleEventEmitter, logger: Logger) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    this.logger.setDebug(debug);
  }

  private compilePatterns(patterns: Array<string | RegExp> | undefined, sourceName: string): RegExp[] {
    if (!patterns || !Array.isArray(patterns)) return [];
    const compiled: RegExp[] = [];
    patterns.forEach((patternSource) => {
      if (patternSource instanceof RegExp) {
        compiled.push(patternSource);
      } else if (typeof patternSource === 'string') {
        try {
          const match = patternSource.match(/^\/(.+)\/([gimyus]*)$/);
          const regex = match ? new RegExp(match[1], match[2]) : new RegExp(patternSource);
          compiled.push(regex);
        } catch (error) {
          this.logger.error(`Error compiling RegExp from ${sourceName} pattern: ${patternSource}`, error);
          this.eventEmitter.emit('security:pattern_error', { source: sourceName, pattern: patternSource, error });
        }
      }
    });
    return compiled;
  }

  async validateArguments(tool: Tool, args: any, context: SecurityContext): Promise<void> {
    const toolName = context.toolName || 'unknown tool';
    if (args === null || args === undefined) {
      this.logger.debug(`Arguments for ${toolName} are missing, validation skipped.`);
      return;
    }
    this.logger.debug(`Validating arguments for ${toolName}`);

    const config = context.config;
    const dangerousArgsConfig: DangerousArgumentsConfig = config.dangerousArguments || {};
    const auditOnlyMode = dangerousArgsConfig.auditOnlyMode ?? context.debug;

    const toolSpecificPatterns = this.getToolDangerousPatterns(tool, context);
    const userDefinedPatterns = this.compilePatterns(dangerousArgsConfig.extendablePatterns, 'config.dangerousArguments.extendablePatterns');
    const globalPatterns = this.compilePatterns(dangerousArgsConfig.globalPatterns, 'config.dangerousArguments.globalPatterns');

    const effectiveGlobalPatterns = globalPatterns.length > 0 ? globalPatterns : this.globalDangerousPatterns;

    const allPatterns = [...effectiveGlobalPatterns, ...toolSpecificPatterns, ...userDefinedPatterns];
    const globalBlockedValues: string[] = Array.isArray(dangerousArgsConfig.blockedValues) ? dangerousArgsConfig.blockedValues : [];
    const violations: string[] = [];

    const checkValue = (value: any, path: string): void => {
        if (value === null || value === undefined) return;

        if (typeof value === 'string' && globalBlockedValues.some((blocked: string) => value.includes(blocked))) {
            violations.push(`Blocked value found in '${path}': ${value}`);
        }
        if (typeof value === 'string') {
            for (const pattern of allPatterns) {
                if (pattern.test(value)) {
                    violations.push(`Dangerous pattern (${pattern.source}) found in '${path}': ${value.substring(0, 100)}...`);
                }
            }
        }

        const keyName = path.split('.').pop() || path;
        const keySpecificRules = dangerousArgsConfig.specificKeyRules?.[keyName];
        if (keySpecificRules) {
             // Placeholder for potential future specific key rules logic
             this.logger.debug(`Applying specific key rules for '${keyName}' (not implemented yet).`);
        }

        if (typeof value === 'object') {
            if (Array.isArray(value)) {
                value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
            } else {
                Object.entries(value).forEach(([key, subValue]) => checkValue(subValue, `${path ? path + '.' : ''}${key}`));
            }
        }
    };

    checkValue(args, '');

    if (violations.length > 0) {
       this.logger.warn(`Dangerous arguments detected for '${toolName}':`, violations);
      this.eventEmitter.emit('security:dangerous_args', { toolName, userId: context.userId, violations, args });

      if (!auditOnlyMode) {
        throw new SecurityError(`Dangerous arguments detected for ${toolName}: ${violations.join('; ')}`, 'DANGEROUS_ARGS', 400, { violations });
      } else {
           this.logger.log(`Audit mode: dangerous arguments detected for ${toolName}, but error not thrown.`);
      }
    } else {
        this.logger.debug(`Argument validation for ${toolName} passed successfully.`);
    }
  }

  private getToolDangerousPatterns(tool: Tool, context: SecurityContext): RegExp[] {
    const toolName = context.toolName;
    const extConfig = context.config;

    const toolSpecificPatternsConfig = extConfig.dangerousArguments?.toolSpecificPatterns?.[toolName || '']
                                    || extConfig.toolConfig?.[toolName || '']?.dangerousPatterns;

    const patterns = this.compilePatterns(toolSpecificPatternsConfig, `tool '${toolName}' specific patterns`);

    this.logger.debug(`Loaded ${patterns.length} specific patterns for '${toolName}'`);
    return patterns;
  }

  destroy(): void {
      this.logger.log("ArgumentSanitizer destroyed.");
  }
}