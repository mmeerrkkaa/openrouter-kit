// Path: utils/json-utils.ts
/**
 * JSON utilities: parsing, schema validation, conversion to string.
 * Uses Ajv for JSON Schema validation.
 */

import Ajv, { ErrorObject, SchemaObject } from 'ajv';
import { ValidationError } from './error';
import { Logger } from './logger';

// Default logger for this module
const defaultLogger = new Logger({ debug: false, prefix: 'JsonUtils' });

/**
 * Options for JSON utility functions.
 */
interface JsonUtilsOptions {
    /** Logger instance for output messages. */
    logger?: Logger;
    /** Provided Ajv instance for schema validation. */
    ajvInstance?: Ajv;
}

// Global instances (can be overridden through setJsonUtilsLogger/options)
let globalAjv: Ajv;
let globalLogger: Logger = defaultLogger;

/**
 * Initializes or gets an Ajv instance for schema validation.
 * @param options - Options including existing Ajv instance.
 * @returns Ajv instance.
 * @private
 */
function getAjvInstance(options?: JsonUtilsOptions): Ajv {
    if (options?.ajvInstance) {
        return options.ajvInstance;
    }
    if (!globalAjv) {
        // allErrors: collect all errors, not just the first one
        // strict: recommended strict schema checks (can be disabled if needed)
        globalAjv = new Ajv({ allErrors: true, strict: false });
    }
    return globalAjv;
}

/**
 * Gets a logger instance to use inside functions.
 * @param options - Options including existing logger instance.
 * @returns Logger instance.
 * @private
 */
function getLogger(options?: JsonUtilsOptions): Logger {
    return options?.logger || globalLogger;
}

/**
 * Safely parses a JSON string. In case of error, returns the default value.
 * Logs a warning on parsing error or if input is not a string.
 *
 * @template T - Expected type of parsing result.
 * @param jsonString - String to parse.
 * @param fallback - Value to return on parsing error.
 * @param options - Options including logger.
 * @returns Parsed object or fallback value.
 * @example
 * const data = safeParse('{"a": 1}', { a: 0 }); // { a: 1 }
 * const fallbackData = safeParse('{invalid json', { a: 0 }); // { a: 0 }
 */
export function safeParse<T = any>(jsonString: string, fallback: T, options?: JsonUtilsOptions): T {
    const logger = getLogger(options);
    if (typeof jsonString !== 'string') {
        logger.warn('safeParse called with non-string, returning fallback.', { inputType: typeof jsonString });
        return fallback;
    }
    try {
        // Check for empty string, as JSON.parse('') throws error
        if (jsonString.trim() === '') {
            logger.warn('safeParse called with empty or whitespace string, returning fallback.');
            return fallback;
        }
        return JSON.parse(jsonString);
    } catch (error) {
        logger.warn(`JSON parsing error: ${(error as Error).message}. String (beginning): "${jsonString.substring(0, 100)}..."`);
        return fallback;
    }
}

/**
 * Parses a JSON string. In case of parsing error or if input is not a string,
 * throws a `ValidationError`.
 *
 * @param jsonString - String to parse.
 * @param entityName - Entity name (e.g., "arguments", "API response") to use in error message.
 * @param options - Options including logger.
 * @returns Parsed object.
 * @throws {ValidationError} If parsing fails or input is not a string.
 * @example
 * try {
 *   const args = parseOrThrow('{"query": "test"}', 'arguments');
 *   console.log(args.query); // "test"
 * } catch (e) {
 *   console.error(e.message); // "Error parsing arguments JSON: ..."
 * }
 */
export function parseOrThrow(jsonString: string, entityName: string = 'JSON', options?: JsonUtilsOptions): any {
    const logger = getLogger(options);
    
    if (typeof jsonString !== 'string') {
        const error = new ValidationError(`Invalid input for ${entityName}: expected string, got ${typeof jsonString}`);
        logger.error(`parseOrThrow failed: ${error.message}`);
        throw error;
    }

    try {
        // Check for empty string
        if (jsonString.trim() === '') {
            const error = new ValidationError(`Error parsing ${entityName}: empty or whitespace string provided`);
            logger.error(error.message);
            throw error;
        }
        const result = JSON.parse(jsonString);
        logger.debug(`Successfully parsed ${entityName} JSON`);
        return result;
    } catch (error) {
        // If error is already ValidationError, just rethrow
        if (error instanceof ValidationError) {
            throw error;
        }
        
        // Otherwise, create ValidationError with original message
        const message = error instanceof Error ? error.message : String(error);
        const wrappedError = new ValidationError(`Error parsing ${entityName} JSON: ${message}`);
        logger.error(`parseOrThrow failed: ${wrappedError.message}`);
        
        // Include original error details
        wrappedError.details = {
            original: error,
            input: jsonString.length > 200 ? `${jsonString.substring(0, 200)}...` : jsonString
        };
        
        throw wrappedError;
    }
}

/**
 * Safely converts value to JSON string. In case of error, returns the default string.
 * Handles circular references and other serialization issues.
 *
 * @param value - Any value to convert to JSON string.
 * @param fallback - Default string to return if serialization fails.
 * @param options - Options including logger.
 * @returns JSON string or fallback.
 * @example
 * const str = safeStringify({ a: 1 }, 'error'); // '{"a":1}'
 * const errStr = safeStringify(circular, 'error'); // 'error'
 */
export function safeStringify(value: any, fallback: string = '{"error":"JSON serialization failed"}', options?: JsonUtilsOptions): string {
    const logger = getLogger(options);
    
    if (value === undefined) {
        logger.debug('safeStringify called with undefined value, returning null JSON string.');
        return 'null';
    }
    
    try {
        return JSON.stringify(value);
    } catch (error) {
        logger.warn(`JSON stringify error: ${(error as Error).message}. Returning fallback.`);
        return fallback;
    }
}

/**
 * Converts a value to JSON string. In case of serialization error,
 * throws a `ValidationError`.
 *
 * @param value - Value to serialize.
 * @param entityName - Entity name (e.g., "result", "response") to use in error message.
 * @param options - Options including logger.
 * @returns JSON string.
 * @throws {ValidationError} If serialization fails.
 * @example
 * try {
 *   const json = stringifyOrThrow({ result: 123 }, 'calculation result');
 *   console.log(json); // '{"result":123}'
 * } catch (e) {
 *   console.error(e.message); // "Error serializing calculation result to JSON: ..."
 * }
 */
export function stringifyOrThrow(value: any, entityName: string = 'value', options?: JsonUtilsOptions): string {
    const logger = getLogger(options);
    
    try {
        if (value === undefined) {
            logger.debug(`stringifyOrThrow: ${entityName} is undefined, returning null JSON string.`);
            return 'null';
        }
        
        const result = JSON.stringify(value);
        logger.debug(`Successfully serialized ${entityName} to JSON string`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const wrappedError = new ValidationError(`Error serializing ${entityName} to JSON: ${message}`);
        logger.error(`stringifyOrThrow failed: ${wrappedError.message}`);
        
        // Add details about what we tried to stringify
        let details: any = { 
            valueType: typeof value
        };
        
        // Try to add safe information about the value
        if (value === null) {
            details.value = null;
        } else if (typeof value === 'object') {
            try {
                details.keys = Object.keys(value);
                details.isArray = Array.isArray(value);
                if (Array.isArray(value)) {
                    details.length = value.length;
                }
            } catch (e) {
                details.inspectionError = (e as Error).message;
            }
        } else {
            // For primitives we can safely add the value
            details.value = value;
        }
        
        wrappedError.details = details;
        throw wrappedError;
    }
}

/**
 * Formats Ajv validation errors into a readable message.
 * @param errors - Array of Ajv error objects.
 * @returns Formatted error message.
 * @private
 */
function formatAjvErrors(errors: ErrorObject[]): string {
    if (!errors || errors.length === 0) return 'Unknown validation error';
    
    return errors.map(err => {
        const path = err.instancePath ? err.instancePath : '<root>';
        const message = err.message || 'unknown error';
        
        // Add additional details based on error keyword
        let details = '';
        if (err.keyword === 'required' && err.params && 'missingProperty' in err.params) {
            details = ` (missing '${err.params.missingProperty}')`;
        } else if (err.keyword === 'type' && err.params && 'type' in err.params) {
            details = ` (expected ${err.params.type})`;
        }
        
        return `${path} ${message}${details}`;
    }).join('; ');
}

/**
 * Validates data against a JSON Schema.
 * Uses Ajv for validation.
 *
 * @param data - Data to validate.
 * @param schema - JSON Schema (as JavaScript object) to validate against.
 * @param entityName - Entity name (e.g., "tool arguments", "API response") to use in error messages.
 * @param options - Options including logger and Ajv instance.
 * @returns `true` if data is valid against schema.
 * @throws {ValidationError} If data doesn't conform to schema or error occurs during schema compilation.
 * @example
 * const schema = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
 * try {
 *   validateJsonSchema({ name: 'Test' }, schema, 'User Data'); // true
 *   validateJsonSchema({ age: 30 }, schema, 'User Data'); // throws ValidationError
 * } catch (e) {
 *   console.error(e.message); // "User Data validation error: <root> must have required property 'name'"
 * }
 */
export function validateJsonSchema(
    data: any,
    schema: SchemaObject, // Using SchemaObject type from Ajv
    entityName: string = 'data',
    options?: JsonUtilsOptions
): boolean {
    const ajv = getAjvInstance(options);
    const logger = getLogger(options);

    if (!schema || typeof schema !== 'object') {
        logger.error(`Invalid schema provided for ${entityName} validation`, { schema });
        throw new ValidationError(`Invalid schema for ${entityName} validation: schema must be an object.`);
    }

    try {
        const validate = ajv.compile(schema);
        const valid = validate(data);

        if (!valid) {
            // Errors definitely exist if valid === false
            const errorMessage = formatAjvErrors(validate.errors!);
            logger.warn(`Schema validation error for ${entityName}: ${errorMessage}`, { data, schema });
            throw new ValidationError(`${entityName} validation error: ${errorMessage}`);
        }

        logger.debug(`Schema validation for ${entityName} passed successfully.`);
        return true;
    } catch (error) {
        // Catch schema compilation errors from Ajv or already thrown ValidationError
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Critical error during ${entityName} schema validation: ${errorMessage}`, { error });
        if (error instanceof ValidationError) {
            // If it's already our validation error, just rethrow it
            throw error;
        }
        // If it's a schema compilation error or other Ajv error
        throw new ValidationError(`Error during ${entityName} schema validation: ${errorMessage}`);
    }
}

/**
 * Checks if the provided string is valid JSON.
 * Does not throw exceptions, returns boolean.
 *
 * @param jsonString - String to check.
 * @param options - Options including logger (for debug messages).
 * @returns `true` if string is valid JSON, otherwise `false`.
 * @example
 * isValidJsonString('{"a": 1}'); // true
 * isValidJsonString('{invalid'); // false
 * isValidJsonString('true'); // true
 * isValidJsonString('null'); // true
 * isValidJsonString('123'); // true
 * isValidJsonString('"string"'); // true
 * isValidJsonString(''); // false
 */
export function isValidJsonString(jsonString: string, options?: JsonUtilsOptions): boolean {
    const logger = getLogger(options);
    if (typeof jsonString !== 'string' || jsonString.trim() === '') {
        // Non-string or empty string is not valid JSON object/array/value in most cases
        return false;
    }
    try {
        JSON.parse(jsonString);
        return true;
    } catch (e) {
         // Log only in debug mode, since this is expected behavior
         logger.debug(`String is not valid JSON: "${jsonString.substring(0, 100)}..."`);
        return false;
    }
}

/**
 * Sets the global logger instance for default use by JSON utilities.
 * @param logger - Logger instance that conforms to `Logger` interface.
 */
export function setJsonUtilsLogger(logger: Logger) {
    if (logger && typeof logger.debug === 'function') {
        globalLogger = logger;
    } else {
        console.error("Attempt to set invalid logger for JsonUtils");
    }
}