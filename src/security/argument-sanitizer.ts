// Path: src/security/argument-sanitizer.ts
import {
    IArgumentSanitizer,
    SecurityContext,
    ExtendedDangerousArgumentsConfig as DangerousArgumentsConfig, // Use renamed type locally
    ExtendedSecurityConfig as SecurityConfig // Use renamed type locally
} from './types';
import { Tool } from '../types';
import { Logger } from '../utils/logger';
import { SecurityError, ErrorCode } from '../utils/error';
import type { SimpleEventEmitter } from '../utils/simple-event-emitter';

export class ArgumentSanitizer implements IArgumentSanitizer {
  private eventEmitter: SimpleEventEmitter;
  private logger: Logger;
  private debugMode: boolean = false;

  private globalDefaultDangerousPatterns: RegExp[] = [
    /rm\s+(-r|-f|-rf|--force|--recursive)\s+[\/~.]/i,
    /(^|\s)(format|mkfs|new-psdrive|mount|umount|parted|fdisk|diskpart)\s+/i,
    /(^|\s)dd\s+if=\/dev\/(zero|random|urandom)/i,
    /(^|;|\||&)\s*(bash|sh|zsh|ksh|csh|powershell|cmd)(\s+|$)/i,
    /(`|\$\(|\{|\}|;|\||&)/,
    /require\s*\(\s*['"`](child_process|vm|worker_threads|node:child_process|node:vm)['"`]\s*\)/i,
    /process\.(env|exit|kill|memoryUsage|cpuUsage|binding|dlopen|abort)/i,
    /import\s+.*\s+from\s+['"`](node:)?(child_process|vm|worker_threads)['"`]/i,
    /\sfs\.(?!read|stat|access|exist|list|watch|constants|promises\.readFile|promises\.stat|promises\.access|promises\.exists|promises\.readdir|promises\.lstat)\w+/i,
    /(^|\s)(eval|exec|execScript|setTimeout|setInterval|new Function)\s*\(/i,
    /<\s*script[\s>]/i,
    /javascript:/i,
    /on(error|load|click|submit|focus|blur|mouse|key)\s*=/i,
    /(--|#|\/\*|;)\s*(drop|delete|insert|update|alter|truncate|create|grant|revoke)\s+/i,
    /'\s*OR\s+'\d+'\s*=\s*'\d+'/i,
    /\.\.\//,
    /%2e%2e%2f/i, /%2e%2e\//i,
    /\.\.%5c/i, /%2e%2e%5c/i,
    /^[a-z]:\\/i,
    /^\//,
  ];

  constructor(eventEmitter: SimpleEventEmitter, logger: Logger) {
    this.eventEmitter = eventEmitter;
    this.logger = logger;
  }

  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    if (typeof (this.logger as any).setDebug === 'function') {
        (this.logger as any).setDebug(debug);
    }
  }

  private compilePatterns(patterns: Array<string | RegExp> | undefined, sourceName: string): RegExp[] {
    if (!patterns || !Array.isArray(patterns)) return [];

    const compiled: RegExp[] = [];
    patterns.forEach((patternSource, index) => {
      try {
          if (patternSource instanceof RegExp) {
              compiled.push(patternSource);
          } else if (typeof patternSource === 'string' && patternSource.trim() !== '') {
              const match = patternSource.match(/^\/(.+)\/([gimyus]*)$/);
              if (match) {
                  compiled.push(new RegExp(match[1], match[2]));
              } else {
                  compiled.push(new RegExp(patternSource));
              }
          } else {
              this.logger.warn(`Skipping empty or invalid pattern source at index ${index} in ${sourceName}`);
          }
      } catch (error) {
          this.logger.error(`Error compiling RegExp from ${sourceName} pattern: "${patternSource}"`, error);
          this.eventEmitter.emit('security:pattern_error', { source: sourceName, pattern: patternSource, error });
      }
    });
    return compiled;
  }

  // Context now contains ExtendedSecurityConfig
  async validateArguments(tool: Tool, args: any, context: SecurityContext): Promise<void> {
    const toolName = context.toolName || 'unknown_tool';
    const userId = context.userId || 'anonymous';

    if (args === null || args === undefined) {
      this.logger.debug(`Arguments for tool '${toolName}' are missing, validation skipped.`);
      return;
    }
    if (typeof args !== 'object') {
        this.logger.debug(`Arguments for tool '${toolName}' are not an object (type: ${typeof args}), validation skipped.`);
        return;
    }

    this.logger.debug(`Validating arguments for tool '${toolName}' (User: ${userId})`);

    const config = context.config; // This is ExtendedSecurityConfig
    // Use the extended DangerousArgumentsConfig type here
    const dangerousArgsConfig: DangerousArgumentsConfig = config.dangerousArguments || {};
    const auditOnlyMode = dangerousArgsConfig.auditOnlyMode ?? context.debug;

    const toolSpecificPatterns = this.getToolDangerousPatterns(tool, context);
    const userDefinedPatterns = this.compilePatterns(dangerousArgsConfig.extendablePatterns, 'config.dangerousArguments.extendablePatterns');
    const configuredGlobalPatterns = this.compilePatterns(dangerousArgsConfig.globalPatterns, 'config.dangerousArguments.globalPatterns');
    const effectiveGlobalPatterns = configuredGlobalPatterns.length > 0 ? configuredGlobalPatterns : this.globalDefaultDangerousPatterns;

    const allPatterns = [
        ...effectiveGlobalPatterns,
        ...toolSpecificPatterns,
        ...userDefinedPatterns
    ];
    this.logger.debug(`Applying ${allPatterns.length} total patterns (${effectiveGlobalPatterns.length} global, ${toolSpecificPatterns.length} tool-specific, ${userDefinedPatterns.length} user-defined).`);

    const globalBlockedValues: string[] = Array.isArray(dangerousArgsConfig.blockedValues)
        ? dangerousArgsConfig.blockedValues.filter((v: any) => typeof v === 'string' && v.length > 0)
        : [];

    const violations: string[] = [];

    const checkValue = (value: any, path: string): void => {
        if (value === null || value === undefined) return;

        if (typeof value === 'string' && globalBlockedValues.some(blocked => value.includes(blocked))) {
            violations.push(`Blocked value fragment found in argument '${path}': "...${value.substring(0, 50)}..."`);
        }

        if (typeof value === 'string') {
            for (const pattern of allPatterns) {
                if (pattern.test(value)) {
                    violations.push(`Dangerous pattern /${pattern.source}/${pattern.flags} matched in argument '${path}': "${value.substring(0, 100)}..."`);
                }
            }
        }

        const keyName = path.split('.').pop() || path;
        const keySpecificRules = dangerousArgsConfig.specificKeyRules?.[keyName];
        if (keySpecificRules) {
             this.logger.debug(`Applying specific key rules for '${keyName}' (logic not implemented).`);
        }

        if (typeof value === 'object') {
            const depth = path.split('.').length;
            if (depth > 10) {
                 this.logger.warn(`Argument validation recursion depth limit reached at path '${path}'. Skipping deeper checks.`);
                 return;
            }

            if (Array.isArray(value)) {
                value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
            } else {
                for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                         checkValue(value[key], `${path ? path + '.' : ''}${key}`);
                    }
                }
            }
        }
    };

    checkValue(args, '');

    if (violations.length > 0) {
       const uniqueViolations = [...new Set(violations)];
       this.logger.warn(`DANGEROUS ARGUMENTS DETECTED for tool '${toolName}' (User: ${userId}). Audit Mode: ${auditOnlyMode}. Violations:`, uniqueViolations);
       this.eventEmitter.emit('security:dangerous_args', {
           toolName,
           userId,
           violations: uniqueViolations,
           args,
           auditOnlyMode
        });

      if (!auditOnlyMode) {
        throw new SecurityError(
            `Dangerous arguments detected for tool '${toolName}'. Input rejected for security reasons.`,
            ErrorCode.DANGEROUS_ARGS,
            400,
            { violations: uniqueViolations }
        );
      } else {
           this.logger.log(`Audit Mode: Dangerous arguments detected for '${toolName}', but execution is allowed.`);
      }
    } else {
        this.logger.debug(`Argument validation passed successfully for tool '${toolName}'.`);
    }
  }

  // Context now contains ExtendedSecurityConfig
  private getToolDangerousPatterns(tool: Tool, context: SecurityContext): RegExp[] {
    const toolName = context.toolName || 'unknown_tool';
    const config = context.config; // This is ExtendedSecurityConfig
    let patterns: Array<string | RegExp> = [];

    // Use extended dangerousArguments type
    const configPatterns = config.dangerousArguments?.toolSpecificPatterns?.[toolName];
    if (configPatterns) {
        patterns = patterns.concat(configPatterns);
    }

    const legacyConfigPatterns = config.toolConfig?.[toolName]?.dangerousPatterns;
     if (legacyConfigPatterns) {
         this.logger.warn(`Using deprecated 'toolConfig[${toolName}].dangerousPatterns'. Please use 'dangerousArguments.toolSpecificPatterns'.`);
         patterns = patterns.concat(legacyConfigPatterns);
     }

    const toolDefPatterns = (tool.security as any)?.dangerousPatterns;
    if (toolDefPatterns) {
        patterns = patterns.concat(toolDefPatterns);
         this.logger.debug(`Found dangerous patterns defined directly on tool '${toolName}'.`);
    }

    const compiledPatterns = this.compilePatterns(patterns, `tool '${toolName}' specific patterns`);
    if (compiledPatterns.length > 0) {
         this.logger.debug(`Loaded ${compiledPatterns.length} specific dangerous patterns for tool '${toolName}'.`);
    }
    return compiledPatterns;
  }

  destroy(): void {
      this.logger.log("ArgumentSanitizer destroyed.");
  }
}