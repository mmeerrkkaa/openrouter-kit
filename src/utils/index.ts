// Path: utils/index.ts
/**
 * Barrel file exporting utilities from the utils directory.
 */

export * from './error';
export * from './formatting';
export * from './validation';
export * from './logger';
// Export jsonUtils as a namespace for clarity (e.g., jsonUtils.parseOrThrow)
export * as jsonUtils from './json-utils';
export * from './simple-event-emitter';