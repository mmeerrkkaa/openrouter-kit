// Path: utils/logger.ts
/**
 * Simple console logger for the OpenRouter Kit library.
 * Allows conditional logging based on debug mode and adding prefixes.
 */
export class Logger {
  private debugMode: boolean;
  private readonly prefix: string;

  /**
   * Creates a logger instance.
   * @param options - Configuration object `{ debug?: boolean, prefix?: string }` or a boolean indicating debug state.
   * @param prefix - Optional prefix string (only used if `options` is boolean).
   */
  constructor(options: { debug?: boolean, prefix?: string } | boolean = false, prefix: string = '') {
    let effectivePrefix = '';
    if (typeof options === 'boolean') {
      this.debugMode = options;
      effectivePrefix = prefix || '';
    } else {
      this.debugMode = options.debug ?? false;
      effectivePrefix = options.prefix || '';
    }
    // Ensure prefix has a trailing space if it exists
    this.prefix = effectivePrefix ? `${effectivePrefix} ` : '';
  }

  /**
   * Enables or disables debug logging.
   * @param debug - `true` to enable, `false` to disable.
   */
  setDebug(debug: boolean): void {
    if (this.debugMode !== debug) {
        // Use console.log directly to ensure this message always shows
        console.log(`${this.prefix}Logger debug mode changed to: ${debug ? 'ENABLED' : 'DISABLED'}.`);
        this.debugMode = debug;
    }
  }

  /** Checks if debug mode is currently enabled. */
  isDebugEnabled(): boolean {
      return this.debugMode;
  }

  /** Logs a debug message (only if debug mode is enabled). */
  debug(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      // Handle non-string first argument correctly
      if (typeof message === 'string') {
        console.debug(`${this.prefix}${message}`, ...args);
      } else {
        console.debug(this.prefix, message, ...args);
      }
    }
  }

  /** Logs an informational message (only if debug mode is enabled). */
  log(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.log(`${this.prefix}${message}`, ...args);
      } else {
        console.log(this.prefix, message, ...args);
      }
    }
  }

  /** Logs a warning message (only if debug mode is enabled). */
  warn(message: string | any, ...args: any[]): void {
    if (this.debugMode) {
      if (typeof message === 'string') {
        console.warn(`${this.prefix}${message}`, ...args);
      } else {
        console.warn(this.prefix, message, ...args);
      }
    }
  }

  /** Logs an error message (only if debug mode is enabled). */
  error(message: string | any, ...args: any[]): void {
    // Errors might be important even if debug is off?
    // Let's keep errors always visible unless explicitly silenced elsewhere.
    // if (this.debugMode) {
      if (typeof message === 'string') {
        console.error(`${this.prefix}${message}`, ...args);
      } else {
        console.error(this.prefix, message, ...args);
      }
    // }
  }

  /**
   * Creates a new logger instance inheriting the current debug state
   * but with an added prefix segment.
   * @param newPrefix - The additional prefix string.
   * @returns A new Logger instance.
   */
  withPrefix(newPrefix: string): Logger {
    // Combine prefixes carefully, ensuring single space separation
    const combinedPrefix = `${this.prefix.trim()} ${newPrefix || ''}`.trim();
    return new Logger({ debug: this.debugMode, prefix: combinedPrefix });
  }
}