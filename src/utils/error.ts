/**
 * Error classes used in the OpenRouter Kit library.
 * All errors inherit from the base class `OpenRouterError`.
 */

/**
 * Error codes for problem classification.
 */
export enum ErrorCode {
  /** Error received from OpenRouter API (status >= 400). */
  API_ERROR = 'api_error',
  /** Data validation error (configuration, arguments, response). */
  VALIDATION_ERROR = 'validation_error',
  /** Network error when connecting to API (not related to HTTP status). */
  NETWORK_ERROR = 'network_error',
  /** Authentication error (e.g., invalid API key). Usually status 401. */
  AUTHENTICATION_ERROR = 'authentication_error',
  /** Authorization error (e.g., invalid JWT token, wrong signature). Usually status 401 or 403. */
  AUTHORIZATION_ERROR = 'authorization_error',
  /** Access denied (user is authenticated but has no rights). Usually status 403. */
  ACCESS_DENIED_ERROR = 'access_denied',
  /** Error during tool function execution (`Tool.execute`). */
  TOOL_ERROR = 'tool_error',
  /** Rate limit exceeded. Usually status 429. */
  RATE_LIMIT_ERROR = 'rate_limit_error',
  /** Timeout waiting for API response. Usually status 408 or network error. */
  TIMEOUT_ERROR = 'timeout_error',
  /** Library or component configuration error. */
  CONFIG_ERROR = 'config_error',
  /** General security error (e.g., validation error). Usually status 400 or 500. */
  SECURITY_ERROR = 'security_error',
  /** Dangerous arguments detected by sanitizer. Usually status 400. */
  DANGEROUS_ARGS = 'dangerous_args', // Added for argument sanitizer
  /** JSON parsing error. */
  JSON_PARSE_ERROR = 'json_parse_error',
  /** JSON schema validation error. */
  JSON_SCHEMA_ERROR = 'json_schema_error',
  /** Unknown or unclassified error. */
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Base class for all errors generated by OpenRouter Kit library.
 */
export class OpenRouterError extends Error {
  /** Error code for programmatic handling. */
  code: ErrorCode;
  /** HTTP status code from API response, if applicable. */
  statusCode?: number;
  /** Additional details or original error. */
  details?: any;

  /**
   * Creates an instance of OpenRouterError.
   * @param message - Human-readable error message.
   * @param code - Error code from `ErrorCode`.
   * @param statusCode - HTTP status code (optional).
   * @param details - Additional information (optional).
   */
  constructor(message: string, code: ErrorCode, statusCode?: number, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

// --- Specific error classes ---

/** Error returned by OpenRouter API (status >= 400). */
export class APIError extends OpenRouterError {
  constructor(message: string, statusCode?: number, details?: any) {
    super(message, ErrorCode.API_ERROR, statusCode, details);
  }
}

/** Data validation error (e.g., incorrect configuration, arguments, response). */
export class ValidationError extends OpenRouterError {
  constructor(message: string, details?: any) {
    let finalCode = ErrorCode.VALIDATION_ERROR;
    if (message.toLowerCase().includes('json') && message.toLowerCase().includes('format')) {
        finalCode = ErrorCode.JSON_PARSE_ERROR;
    } else if (message.toLowerCase().includes('json') && message.toLowerCase().includes('schema')) {
         finalCode = ErrorCode.JSON_SCHEMA_ERROR;
     }
    super(message, finalCode, 400, details);
  }
}

/** Network error when attempting to connect to API (not related to HTTP status). */
export class NetworkError extends OpenRouterError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.NETWORK_ERROR, undefined, details);
  }
}

/** Authentication error (e.g., invalid API key). */
export class AuthenticationError extends OpenRouterError {
  constructor(message: string, statusCode: number = 401, details?: any) {
    super(message, ErrorCode.AUTHENTICATION_ERROR, statusCode, details);
  }
}

/** Authorization error (e.g., invalid JWT token, expired). */
export class AuthorizationError extends OpenRouterError {
  constructor(message: string, statusCode: number = 401, details?: any) {
    super(message, ErrorCode.AUTHORIZATION_ERROR, statusCode, details);
  }
}

/** Access denied: user is authenticated but does not have rights to resource/action. */
export class AccessDeniedError extends OpenRouterError {
  constructor(message: string, statusCode: number = 403, details?: any) {
    super(message, ErrorCode.ACCESS_DENIED_ERROR, statusCode, details);
  }
}

/** Error occurred during tool function execution (`Tool.execute`). */
export class ToolError extends OpenRouterError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.TOOL_ERROR, 500, details);
  }
}

/** Rate limit exceeded. */
export class RateLimitError extends OpenRouterError {
  constructor(message: string, statusCode: number = 429, details?: any) {
    super(message, ErrorCode.RATE_LIMIT_ERROR, statusCode, details);
  }
}

/** Timeout waiting for API response. */
export class TimeoutError extends OpenRouterError {
  constructor(message: string, statusCode: number = 408, details?: any) {
    super(message, ErrorCode.TIMEOUT_ERROR, statusCode, details);
  }
}

/** Library or component configuration error. */
export class ConfigError extends OpenRouterError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.CONFIG_ERROR, 500, details);
  }
}

/** General security error (e.g., dangerous arguments, validation error). */
export class SecurityError extends OpenRouterError {
  constructor(message: string, code: string = ErrorCode.SECURITY_ERROR, statusCode: number = 400, details?: any) {
      const finalCode = Object.values(ErrorCode).includes(code as ErrorCode) ? code as ErrorCode : ErrorCode.SECURITY_ERROR;
      super(message, finalCode, statusCode, details);
  }
}


/**
 * Converts various errors (Axios, standard Error, etc.)
 * to one of the subclasses of `OpenRouterError`.
 *
 * @param error - Original error of any type.
 * @returns Instance of `OpenRouterError` or its subclass.
 */
export function mapError(error: any): OpenRouterError {
  if (error instanceof OpenRouterError) {
    return error;
  }

  if (error?.isAxiosError === true) {
    const axiosError = error as import('axios').AxiosError;
    const statusCode = axiosError.response?.status;
    const responseData = axiosError.response?.data;
    const message =
        (responseData as any)?.error?.message ||
        (responseData as any)?.message ||
        axiosError.message ||
        'Network error when requesting API';

    if (statusCode) {
        switch (statusCode) {
            case 400:
                if (message.toLowerCase().includes('validation') || message.toLowerCase().includes('invalid request')) {
                     if (message.toLowerCase().includes('json') && message.toLowerCase().includes('format')) {
                         return new ValidationError(message, { ...(responseData as object), axiosRequest: axiosError.request, axiosConfig: axiosError.config });
                     } else if (message.toLowerCase().includes('json') && message.toLowerCase().includes('schema')) {
                          return new ValidationError(message, { ...(responseData as object), axiosRequest: axiosError.request, axiosConfig: axiosError.config });
                      }
                    return new ValidationError(message, { ...(responseData as object), axiosRequest: axiosError.request, axiosConfig: axiosError.config });
                }
                return new APIError(message, statusCode, { ...(responseData as object), axiosRequest: axiosError.request, axiosConfig: axiosError.config });
            case 401:
                return new AuthenticationError(message || 'Authentication error: invalid API key or token', statusCode, responseData);
            case 403:
                return new AccessDeniedError(message || 'Access denied to API', statusCode, responseData);
            case 429:
                return new RateLimitError(message || 'Rate limit exceeded for API', statusCode, responseData);
            case 408:
                return new TimeoutError(message || 'Timeout waiting for API response', statusCode, responseData);
            default:
                if (statusCode >= 400 && statusCode < 500) {
                    return new APIError(message || `Client API error (status ${statusCode})`, statusCode, responseData);
                } else if (statusCode >= 500) {
                    return new APIError(message || `Server API error (status ${statusCode})`, statusCode, responseData);
                }
        }
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.message.toLowerCase().includes('timeout')) {
      return new TimeoutError('Timeout waiting for API response', 408, { originalError: axiosError });
    }
    return new NetworkError(message, { originalError: axiosError });
  }

  if (error instanceof Error) {
    if (error.name === 'ValidationError') return new ValidationError(error.message, { originalError: error });
    if (error.name === 'ConfigError') return new ConfigError(error.message, { originalError: error });

    return new OpenRouterError(
      error.message || 'Unknown execution error',
      ErrorCode.UNKNOWN_ERROR,
      undefined,
      { originalErrorName: error.name, stack: error.stack }
    );
  }

  let errorMessage = 'Unknown error occurred';
  try {
      errorMessage = JSON.stringify(error);
  } catch { /* Ignore */ }
  return new OpenRouterError(
    errorMessage,
    ErrorCode.UNKNOWN_ERROR,
    undefined,
    { originalValue: error }
  );
}