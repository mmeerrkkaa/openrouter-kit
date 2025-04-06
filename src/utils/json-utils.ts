/**
 * JSON utilities: parsing, schema validation, serialization.
 * Uses Ajv for JSON Schema validation.
 */

import Ajv, { ErrorObject, SchemaObject, ValidateFunction } from 'ajv';
// Use relative path for error import
import { ValidationError, ErrorCode } from './error';
// Use relative path for logger import
import { Logger } from './logger';

const defaultLogger = new Logger({ debug: false, prefix: 'JsonUtils' });

interface JsonUtilsOptions {
    logger?: Logger;
    ajvInstance?: Ajv;
}

let globalAjv: Ajv | null = null;
let globalLogger: Logger = defaultLogger;
const compiledSchemaCache = new Map<SchemaObject, ValidateFunction>();

function getAjvInstance(options?: JsonUtilsOptions): Ajv {
    if (options?.ajvInstance) {
        return options.ajvInstance;
    }
    if (!globalAjv) {
        globalAjv = new Ajv({ allErrors: true, strict: false, coerceTypes: false });
    }
    return globalAjv;
}

function getLogger(options?: JsonUtilsOptions): Logger {
    return options?.logger || globalLogger;
}

export function safeParse<T = any>(jsonString: string, fallback: T, options?: JsonUtilsOptions): T {
    const logger = getLogger(options);
    if (typeof jsonString !== 'string') {
        logger.warn('safeParse called with non-string input, returning fallback.', { inputType: typeof jsonString });
        return fallback;
    }
    const trimmedString = jsonString.trim();
    if (trimmedString === '') {
        logger.debug('safeParse called with empty or whitespace string, returning fallback.');
        return fallback;
    }
    try {
        return JSON.parse(trimmedString);
    } catch (error) {
        logger.warn(`JSON parsing error: ${(error as Error).message}. Returning fallback. Input (start): "${trimmedString.substring(0, 100)}..."`);
        return fallback;
    }
}

export function parseOrThrow(jsonString: string, entityName: string = 'JSON', options?: JsonUtilsOptions): any {
    const logger = getLogger(options);

    if (typeof jsonString !== 'string') {
        const error = new ValidationError(`Invalid input for ${entityName}: expected a string, but received type ${typeof jsonString}.`, { inputType: typeof jsonString });
        logger.error(`parseOrThrow failed: ${error.message}`);
        throw error;
    }

    const trimmedString = jsonString.trim();

    if ((trimmedString === '' || trimmedString === '{}') && entityName.toLowerCase().includes('argument')) {
        logger.debug(`Parsed ${entityName}: empty string or '{}' treated as empty object.`);
        return {};
    }

    if (trimmedString === '') {
        const error = new ValidationError(`Error parsing ${entityName}: received empty or whitespace string.`);
        logger.error(error.message);
        throw error;
    }

    try {
        const result = JSON.parse(trimmedString);
        logger.debug(`Successfully parsed ${entityName} JSON.`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Pass the correct ErrorCode to the constructor
        const wrappedError = new ValidationError(
            `Error parsing ${entityName} JSON: ${message}`,
            {
                originalError: error,
                inputPreview: trimmedString.length > 200 ? `${trimmedString.substring(0, 200)}...` : trimmedString
            }
        );
        // wrappedError.code = ErrorCode.JSON_PARSE_ERROR; // Cannot assign to readonly property
        logger.error(`parseOrThrow failed: ${wrappedError.message}`);
        throw wrappedError; // ValidationError constructor now handles setting the code based on message
    }
}

export function safeStringify(value: any, fallback: string = '{"error":"JSON serialization failed"}', options?: JsonUtilsOptions): string {
    const logger = getLogger(options);
    try {
        if (value === undefined) {
            logger.debug('safeStringify called with undefined value, returning "null" string.');
            return 'null';
        }
        return JSON.stringify(value);
    } catch (error) {
        logger.warn(`JSON stringify error: ${(error as Error).message}. Returning fallback string. Value type: ${typeof value}`);
        return fallback;
    }
}

export function stringifyOrThrow(value: any, entityName: string = 'value', options?: JsonUtilsOptions): string {
    const logger = getLogger(options);
    try {
        if (value === undefined) {
            logger.debug(`stringifyOrThrow: ${entityName} is undefined, returning "null" JSON string.`);
            return 'null';
        }
        const result = JSON.stringify(value);
        logger.debug(`Successfully serialized ${entityName} to JSON string.`);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        let valueContext = `Type: ${typeof value}`;
        if (typeof value === 'object' && value !== null) {
            valueContext += `, Keys: ${Object.keys(value).slice(0, 5).join(', ')}${Object.keys(value).length > 5 ? '...' : ''}`;
        }

        const wrappedError = new ValidationError(
            `Error serializing ${entityName} to JSON: ${message}`,
            { originalError: error, valueContext }
        );
        logger.error(`stringifyOrThrow failed: ${wrappedError.message}`);
        throw wrappedError;
    }
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
    if (!errors || errors.length === 0) return 'Unknown validation error';

    return errors.map(err => {
        const path = err.instancePath || '<root>';
        let message = err.message || 'Invalid value';
        if (err.keyword === 'required') {
            message = `Property '${err.params.missingProperty}' is required`;
        } else if (err.keyword === 'type') {
            message = `Expected type ${err.params.type} but received ${typeof err.data}`;
        } else if (err.keyword === 'enum') {
             message = `Value must be one of: ${err.params.allowedValues.join(', ')}`;
         } else if (err.keyword === 'additionalProperties') {
             message = `Property '${err.params.additionalProperty}' is not allowed`;
         }
        return `${path}: ${message}`;
    }).join('; ');
}

export function validateJsonSchema(
    data: any,
    schema: SchemaObject,
    entityName: string = 'data',
    options?: JsonUtilsOptions
): boolean {
    const ajv = getAjvInstance(options);
    const logger = getLogger(options);

    if (!schema || typeof schema !== 'object') {
        logger.error(`Invalid schema provided for ${entityName} validation: Schema must be an object.`, { schema });
        throw new ValidationError(`Invalid schema provided for ${entityName}: Schema must be an object.`);
    }

    let validate: ValidateFunction;

    try {
        if (compiledSchemaCache.has(schema)) {
            validate = compiledSchemaCache.get(schema)!;
             logger.debug(`Using cached compiled schema for ${entityName}.`);
        } else {
            validate = ajv.compile(schema);
            compiledSchemaCache.set(schema, validate);
             logger.debug(`Compiled and cached schema for ${entityName}.`);
        }

        const valid = validate(data);

        if (!valid) {
            const errorMessage = formatAjvErrors(validate.errors);
            logger.warn(`Schema validation failed for ${entityName}: ${errorMessage}`, { data, schemaErrors: validate.errors });
            // Pass correct ErrorCode to constructor
            const validationError = new ValidationError(
                `${entityName} validation failed: ${errorMessage}`,
                { schemaErrors: validate.errors, data }
            );
            // validationError.code = ErrorCode.JSON_SCHEMA_ERROR; // Cannot assign to readonly
            throw validationError; // Constructor handles code based on message now
        }

        logger.debug(`Schema validation passed successfully for ${entityName}.`);
        return true;

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Critical error during ${entityName} schema validation: ${message}`, { error, schema });

        if (error instanceof ValidationError) {
            throw error;
        } else {
            throw new ValidationError(`Error during ${entityName} schema validation: ${message}`, { originalError: error });
        }
    }
}

export function isValidJsonString(jsonString: string, options?: JsonUtilsOptions): boolean {
    const logger = getLogger(options);
    if (typeof jsonString !== 'string' || jsonString.trim() === '') {
        return false;
    }
    try {
        JSON.parse(jsonString);
        return true;
    } catch (e) {
         logger.debug(`String is not valid JSON: "${jsonString.substring(0, 100)}..."`);
        return false;
    }
}

export function setJsonUtilsLogger(loggerInstance: Logger) {
    if (loggerInstance && typeof loggerInstance.debug === 'function') {
        globalLogger = loggerInstance;
    } else {
        console.error("[JsonUtils] Attempted to set an invalid logger instance.");
    }
}