// Path: utils/logger.ts
/**
 * Unified logger for OpenRouter Client library.
 * Allows outputting messages to console depending on debug mode (`debugMode`).
 * Supports prefixes to identify message source.
 */
export class Logger {
  private debugMode: boolean;
  private readonly prefix: string;

  /**
   * Creates a logger instance.
   * @param options - Logger options (`{ debug?: boolean, prefix?: string }`) or debug mode flag (`boolean`).
   * @param prefix - Prefix for logger messages (used only if `options` is `boolean`).
   *
   * @example
   * // Logger disabled, no prefix
   * const logger1 = new Logger();
   * @example
   * // Logger enabled, no prefix
   * const logger2 = new Logger(true);
   * @example
   * // Logger enabled, with prefix
   * const logger3 = new Logger({ debug: true, prefix: '[MyComponent]' });
   * @example
   * // Logger disabled, with prefix (illogical but possible)
   * const logger4 = new Logger(false, '[MyComponent]');
   */
  constructor(options: { debug?: boolean, prefix?: string } | boolean = false, prefix: string = '') {
    if (typeof options === 'boolean') {
      // Constructor called as new Logger(true, '[Prefix]')
      this.debugMode = options;
      this.prefix = prefix ? `${prefix} ` : ''; // Add space after prefix
    } else {
      // Constructor called as new Logger({ debug: true, prefix: '[Prefix]' })
      this.debugMode = options.debug ?? false;
      this.prefix = options.prefix ? `${options.prefix} ` : ''; // Add space
    }
  }

  /**
   * Sets debug mode (enables or disables output of `debug`, `log`, `warn`, `error` messages).
   * @param debug - `true` to enable logs, `false` to disable.
   */
  setDebug(debug: boolean): void {
    if (this.debugMode !== debug) {
        // Log mode change only if it's actually changing
        // Use console.log directly to ensure this message is always shown
        console.log(`${this.prefix}Logger debug mode ${debug ? 'enabled' : 'disabled'}.`);
        this.debugMode = debug;
    }
  }

  /**
   * Checks if debug mode is enabled.
   * @returns {boolean}
   */
  isDebugEnabled(): boolean {
      return this.debugMode;
  }

  /**
   * Outputs debug message to console (`console.debug`).
   * Message is shown only if `debugMode` is enabled.
   * @param message - Main message (string or object).
   * @param args - Additional arguments to output to console.
   */
  debug(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.debug(`${this.prefix}${message}`, ...args);
      } else {
        // If first arg is not string, output prefix separately
        console.debug(`${this.prefix}`, message, ...args);
      }
    }
  }

  /**
   * Outputs info message to console (`console.log`).
   * Message is shown only if `debugMode` is enabled.
   * @param message - Main message (string or object).
   * @param args - Additional arguments to output to console.
   */
  log(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.log(`${this.prefix}${message}`, ...args);
      } else {
        console.log(`${this.prefix}`, message, ...args);
      }
    }
  }

  /**
   * Outputs error message to console (`console.error`).
   * Message is shown only if `debugMode` is enabled.
   * @param message - Main message (string or object).
   * @param args - Additional arguments to output to console (often Error object).
   */
  error(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.error(`${this.prefix}${message}`, ...args);
      } else {
        console.error(`${this.prefix}`, message, ...args);
      }
    }
  }

  /**
   * Outputs warning to console (`console.warn`).
   * Message is shown only if `debugMode` is enabled.
   * @param message - Main message (string or object).
   * @param args - Additional arguments to output to console.
   */
  warn(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.warn(`${this.prefix}${message}`, ...args);
      } else {
        console.warn(`${this.prefix}`, message, ...args);
      }
    }
  }

  /**
   * Creates a new logger instance with the same debug mode but new (or added) prefix.
   * @param newPrefix - New prefix for child logger.
   * @returns New `Logger` instance.
   * @example
   * const baseLogger = new Logger(true, '[App]');
   * const serviceLogger = baseLogger.withPrefix('[ServiceA]');
   * serviceLogger.log('Service A started'); // Will output: [App] [ServiceA] Service A started
   */
  withPrefix(newPrefix: string): Logger {
    // Combine current prefix with new one
    const combinedPrefix = `${this.prefix.trim()} ${newPrefix}`.trim();
    return new Logger({ debug: this.debugMode, prefix: combinedPrefix });
  }
}