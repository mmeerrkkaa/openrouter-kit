/**
 * Error classes used in the OpenRouter Kit library.
 * All custom errors inherit from the base class `OpenRouterError`.
 * Includes a `mapError` function to standardize various error types.
 */

/**
 * Standardized error codes for classifying issues.
 */
export enum ErrorCode {
  /** Error response from the OpenRouter API (HTTP status >= 400). */
  API_ERROR = 'api_error',
  /** Data validation failed (config, arguments, response schema). */
  VALIDATION_ERROR = 'validation_error',
  /** Network issue connecting to the API (e.g., DNS, connection refused). */
  NETWORK_ERROR = 'network_error',
  /** Authentication failed (e.g., invalid API key, missing auth header). Status 401. */
  AUTHENTICATION_ERROR = 'authentication_error',
  /** Authorization failed (e.g., invalid/expired JWT, bad signature). Status 401/403. */
  AUTHORIZATION_ERROR = 'authorization_error',
  /** Access denied (authenticated but lacks permissions). Status 403. */
  ACCESS_DENIED_ERROR = 'access_denied',
  /** Error during the execution of a tool's `execute` function. */
  TOOL_ERROR = 'tool_error',
  /** API rate limit exceeded. Status 429. */
  RATE_LIMIT_ERROR = 'rate_limit_error',
  /** Request timed out waiting for API response. Status 408 or network timeout. */
  TIMEOUT_ERROR = 'timeout_error',
  /** Invalid library or component configuration. */
  CONFIG_ERROR = 'config_error',
  /** General security-related error (e.g., failed check, policy violation). */
  SECURITY_ERROR = 'security_error',
  /** Potentially dangerous arguments detected by sanitizer. Status 400. */
  DANGEROUS_ARGS = 'dangerous_args',
  /** Error parsing a JSON string. */
  JSON_PARSE_ERROR = 'json_parse_error',
  /** Data failed validation against a JSON Schema. */
  JSON_SCHEMA_ERROR = 'json_schema_error',
  /** JWT signing error. */
  JWT_SIGN_ERROR = 'jwt_sign_error',
   /** Error during JWT validation (expired, invalid signature etc.) */
  JWT_VALIDATION_ERROR = 'jwt_validation_error',
  /** An internal error within the library code. */
  INTERNAL_ERROR = 'internal_error',
  /** Unknown or unclassified error. */
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Base error class for all library-specific errors.
 */
export class OpenRouterError extends Error {
  /** Standardized error code for programmatic handling. */
  public readonly code: ErrorCode;
  /** Optional: HTTP status code associated with the error. */
  public readonly statusCode?: number;
  /** Optional: Additional details, context, or the original error. */
  public readonly details?: any;

  constructor(message: string, code: ErrorCode, statusCode?: number, details?: any) {
    super(message);
    this.name = this.constructor.name; // Set name to the specific subclass name (e.g., APIError)
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Ensure instanceof works correctly
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace if available
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

// --- Specific Error Subclasses ---

/** Error returned by the OpenRouter API (status >= 400). */
export class APIError extends OpenRouterError {
  constructor(message: string, statusCode?: number, details?: any) {
    super(message, ErrorCode.API_ERROR, statusCode, details);
  }
}

/** Data validation error (config, arguments, schema). */
export class ValidationError extends OpenRouterError {
  constructor(message: string, details?: any) {
    // Default to validation error code, potentially overridden by specific types below
    let specificCode = ErrorCode.VALIDATION_ERROR;
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('json') && (lowerMessage.includes('parse') || lowerMessage.includes('format'))) {
        specificCode = ErrorCode.JSON_PARSE_ERROR;
    } else if (lowerMessage.includes('json') && lowerMessage.includes('schema')) {
         specificCode = ErrorCode.JSON_SCHEMA_ERROR;
     }
    // Validation errors are typically client errors (400)
    super(message, specificCode, 400, details);
  }
}

/** Network error during API request (connection, DNS). */
export class NetworkError extends OpenRouterError {
  constructor(message: string, details?: any) {
    // No specific HTTP status code for network errors before response
    super(message, ErrorCode.NETWORK_ERROR, undefined, details);
  }
}

/** Authentication error (invalid API key, missing token). Typically 401. */
export class AuthenticationError extends OpenRouterError {
  constructor(message: string, statusCode: number = 401, details?: any) {
    super(message, ErrorCode.AUTHENTICATION_ERROR, statusCode, details);
  }
}

/** Authorization error (invalid JWT, expired token, wrong signature). Typically 401/403. */
export class AuthorizationError extends OpenRouterError {
  constructor(message: string, statusCode: number = 401, details?: any) {
    let code = ErrorCode.AUTHORIZATION_ERROR;
    // Distinguish JWT validation errors if possible from message
     if (message.toLowerCase().includes('jwt') || message.toLowerCase().includes('token expired') || message.toLowerCase().includes('invalid signature')) {
         code = ErrorCode.JWT_VALIDATION_ERROR;
     }
    super(message, code, statusCode, details);
  }
}

/** Access denied (authenticated but lacks permission). Typically 403. */
export class AccessDeniedError extends OpenRouterError {
  constructor(message: string, statusCode: number = 403, details?: any) {
    super(message, ErrorCode.ACCESS_DENIED_ERROR, statusCode, details);
  }
}

/** Error during tool function execution. Typically 500 (internal server error context). */
export class ToolError extends OpenRouterError {
  constructor(message: string, details?: any) {
    super(message, ErrorCode.TOOL_ERROR, 500, details);
  }
}

/** Rate limit exceeded. Typically 429. */
export class RateLimitError extends OpenRouterError {
  constructor(message: string, statusCode: number = 429, details?: any) {
    super(message, ErrorCode.RATE_LIMIT_ERROR, statusCode, details);
  }
}

/** Request timed out. Typically 408. */
export class TimeoutError extends OpenRouterError {
  constructor(message: string, statusCode: number = 408, details?: any) {
    super(message, ErrorCode.TIMEOUT_ERROR, statusCode, details);
  }
}

/** Invalid library configuration. Typically indicates a setup issue. */
export class ConfigError extends OpenRouterError {
  constructor(message: string, details?: any) {
    // Configuration errors are internal/setup related, often not tied to a specific HTTP status
    super(message, ErrorCode.CONFIG_ERROR, 500, details);
  }
}

/** General security error (policy violation, dangerous args). Typically 400/403. */
export class SecurityError extends OpenRouterError {
  // Allow passing a specific ErrorCode like DANGEROUS_ARGS
  constructor(message: string, code: string = ErrorCode.SECURITY_ERROR, statusCode: number = 400, details?: any) {
      // Ensure the provided code is a valid ErrorCode enum member
      const finalCode = Object.values(ErrorCode).includes(code as ErrorCode)
          ? code as ErrorCode
          : ErrorCode.SECURITY_ERROR;
      super(message, finalCode, statusCode, details);
  }
}


/**
 * Maps various error types (Axios, standard Error, etc.) to a standardized OpenRouterError subclass.
 *
 * @param error - The original error object (can be of any type).
 * @returns An instance of OpenRouterError or one of its subclasses.
 */
export function mapError(error: any): OpenRouterError {
  // If it's already one of our errors, return it directly
  if (error instanceof OpenRouterError) {
    return error;
  }

  // Handle Axios errors specifically
  if (error?.isAxiosError === true) {
    const axiosError = error as import('axios').AxiosError;
    const statusCode = axiosError.response?.status;
    const responseData = axiosError.response?.data;
    const errorDetails = {
        ...(typeof responseData === 'object' ? responseData : { responseData }), // Ensure details are object
        requestUrl: axiosError.config?.url,
        requestMethod: axiosError.config?.method?.toUpperCase(),
        axiosErrorCode: axiosError.code, // e.g., 'ECONNABORTED'
    };

    // Try to extract a meaningful message from response data or Axios error
    let message = 'API request failed';
    if (typeof responseData === 'object' && responseData !== null) {
        message = (responseData as any).error?.message || (responseData as any).message || axiosError.message;
    } else if (typeof responseData === 'string') {
         message = responseData; // Use string response directly if available
     } else {
         message = axiosError.message; // Fallback to Axios message
     }


    if (statusCode) {
        // Map HTTP status codes to specific error types
        switch (statusCode) {
            case 400:
                // Could be validation or other bad request
                 if (message.toLowerCase().includes('validation')) {
                    return new ValidationError(message, errorDetails);
                 }
                return new APIError(message, statusCode, errorDetails);
            case 401:
                 // Could be Authentication or Authorization depending on context
                 // Let's default to Authentication, AuthManager might create AuthorizationError specifically
                return new AuthenticationError(message || 'Authentication required', statusCode, errorDetails);
            case 403:
                return new AccessDeniedError(message || 'Access denied', statusCode, errorDetails);
            case 408:
                 return new TimeoutError(message || 'Request timed out', statusCode, errorDetails);
            case 429:
                return new RateLimitError(message || 'Rate limit exceeded', statusCode, errorDetails);
            default:
                // General API error for other 4xx/5xx
                return new APIError(message || `API Error (Status ${statusCode})`, statusCode, errorDetails);
        }
    } else if (axiosError.code === 'ECONNABORTED' || axiosError.message.toLowerCase().includes('timeout')) {
        // Handle Axios timeout errors
        return new TimeoutError(message || 'Request timed out', 408, errorDetails);
    } else {
        // Handle other network-level errors (DNS, connection refused, etc.)
        return new NetworkError(message || 'Network error during API request', errorDetails);
    }
  }

  // Handle standard JavaScript errors
  if (error instanceof Error) {
    // Check name for specific standard error types if needed
    // if (error.name === 'TypeError') { ... }

    // Map based on known library error names if used without proper class hierarchy before
    if (error.name === 'ValidationError') return new ValidationError(error.message, { originalError: error });
    if (error.name === 'ConfigError') return new ConfigError(error.message, { originalError: error });
    if (error.name === 'SecurityError') return new SecurityError(error.message, ErrorCode.SECURITY_ERROR, 400, { originalError: error });
     if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
          return new AuthorizationError(error.message, 401, { originalError: error });
      }

    // Fallback for generic Errors
    return new OpenRouterError(
      error.message || 'An unexpected error occurred',
      ErrorCode.UNKNOWN_ERROR, // Default to unknown
      undefined, // No status code available
      { originalErrorName: error.name, stack: error.stack } // Include original details
    );
  }

  // Handle non-Error types (strings, objects, etc.)
  let errorMessage = 'An unknown error object was thrown';
  let details: any = { originalValue: error };
  try {
      // Try to stringify non-errors for logging
      errorMessage = `Unknown error: ${JSON.stringify(error)}`;
  } catch { /* Ignore stringify errors */ }

  return new OpenRouterError(
    errorMessage,
    ErrorCode.UNKNOWN_ERROR,
    undefined,
    details
  );
}