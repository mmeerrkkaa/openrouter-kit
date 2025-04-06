// Path: utils/simple-event-emitter.ts
/**
 * A basic, dependency-free event emitter implementation for internal library use.
 */

// Type definition for event handler functions
type EventHandler = (payload?: any) => void;

export class SimpleEventEmitter {
    // Store listeners in an object where keys are event names and values are arrays of handlers
    private listeners: { [event: string]: EventHandler[] } = {};

    /**
     * Subscribes a handler function to an event.
     * @param event - The name of the event to subscribe to.
     * @param handler - The function to call when the event is emitted.
     */
    on(event: string, handler: EventHandler): void {
        // Ensure the handler is a function
        if (typeof handler !== 'function') {
            console.error(`[SimpleEventEmitter] Handler for event "${event}" is not a function.`);
            return;
        }
        // Initialize the listener array if it doesn't exist
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        // Add the handler to the array
        this.listeners[event].push(handler);
    }

    /**
     * Unsubscribes a specific handler function from an event.
     * @param event - The name of the event to unsubscribe from.
     * @param handler - The handler function to remove.
     */
    off(event: string, handler: EventHandler): void {
        // Check if there are any listeners for this event
        if (this.listeners[event]) {
            // Filter out the specific handler
            this.listeners[event] = this.listeners[event].filter(h => h !== handler);
            // Optional: Clean up the event entry if no listeners remain
            if (this.listeners[event].length === 0) {
                delete this.listeners[event];
            }
        }
    }

    /**
     * Emits an event, calling all subscribed handlers with the provided payload.
     * Handlers are called synchronously in the order they were added.
     * Includes basic error handling for individual handlers.
     * @param event - The name of the event to emit.
     * @param payload - Optional data to pass to the event handlers.
     */
    emit(event: string, payload?: any): void {
        // Check if there are any listeners for this event
        if (this.listeners[event]) {
            // Create a copy of the listeners array before iterating.
            // This prevents issues if a handler modifies the listeners array (e.g., calls off() on itself).
            const handlersToExecute = [...this.listeners[event]];

            // Execute each handler
            handlersToExecute.forEach(handler => {
                try {
                    // Call the handler with the payload
                    handler(payload);
                } catch (error) {
                    // Log errors from handlers but don't let them stop other handlers
                    console.error(`[SimpleEventEmitter] Error in handler for event "${event}":`, error);
                    // Optionally re-throw or emit an 'error' event? For internal use, console.error is often sufficient.
                    // this.emit('error', { sourceEvent: event, handlerError: error });
                }
            });
        }
    }

    /**
     * Removes all event handlers for a specific event, or all handlers for all events.
     * @param event - Optional: The name of the event to clear listeners for. If omitted, all listeners for all events are removed.
     */
    removeAllListeners(event?: string): void {
        if (event) {
            // Remove listeners only for the specified event
            delete this.listeners[event];
        } else {
            // Remove all listeners for all events
            this.listeners = {};
        }
    }
}