// Path: security/security-event-emitter.ts

import { ISecurityEventEmitter } from './types';

/**
 * Class for managing security events.
 * Provides a publish-subscribe mechanism to reduce coupling between components.
 */
export class SecurityEventEmitter implements ISecurityEventEmitter {
  // Using Record<string, Array<Function>> to store subscribers
  private eventHandlers: Record<string, Array<(event: any) => void>> = {};

  /**
   * Subscribes a handler to an event.
   * @param event - Event name (string).
   * @param handler - Event handler function.
   */
  on(event: string, handler: (event: any) => void): void {
    if (typeof handler !== 'function') {
      console.error(`[SecurityEventEmitter] Attempt to subscribe to event '${event}' with non-function.`);
      return;
    }
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    // Add handler if it doesn't already exist
    if (!this.eventHandlers[event].includes(handler)) {
        this.eventHandlers[event].push(handler);
    }
  }

  /**
   * Unsubscribes a handler from an event.
   * @param event - Event name.
   * @param handler - Handler function to remove.
   */
  off(event: string, handler: (event: any) => void): void {
    if (!this.eventHandlers[event]) {
      return; // No subscribers for this event
    }

    // Filter the array, keeping all handlers except the specified one
    this.eventHandlers[event] = this.eventHandlers[event].filter(
      existingHandler => existingHandler !== handler
    );

    // If no subscribers remain for the event, delete the event key
    if (this.eventHandlers[event].length === 0) {
        delete this.eventHandlers[event];
    }
  }

  /**
   * Publishes (emits) an event, calling all its subscribers.
   * @param event - Event name.
   * @param data - Event data passed to handlers.
   */
  emit(event: string, data?: any): void { // data is optional
    if (!this.eventHandlers[event]) {
      return; // No subscribers for this event
    }

    // Call handlers on a copy of the array to avoid issues when unsubscribing inside a handler
    const handlers = [...this.eventHandlers[event]];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        // Log handler error but don't stop execution of other handlers
        console.error(`[SecurityEventEmitter] Error in handler for event '${event}':`, error);
      }
    });
  }

  /**
   * Removes all subscribers for a specified event or for all events.
   * @param event - Event name (optional). If not specified, all subscribers are removed.
   */
  removeAllListeners(event?: string): void {
      if (event) {
          if (this.eventHandlers[event]) {
              delete this.eventHandlers[event];
              // console.log(`[SecurityEventEmitter] Removed all handlers for event: ${event}`);
          }
      } else {
          this.eventHandlers = {};
          // console.log(`[SecurityEventEmitter] Removed all handlers for all events.`);
      }
  }
}