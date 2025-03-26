// Path: utils/simple-event-emitter.ts
/**
 * Simple Event Emitter for internal library events.
 */
type EventHandler = (payload?: any) => void;

export class SimpleEventEmitter {
    private listeners: { [event: string]: EventHandler[] } = {};

    /**
     * Subscribes handler to an event.
     * @param event - Event name.
     * @param handler - Handler function.
     */
    on(event: string, handler: EventHandler): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(handler);
    }

    /**
     * Unsubscribes handler from an event.
     * @param event - Event name.
     * @param handler - Handler function to remove.
     */
    off(event: string, handler: EventHandler): void {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(h => h !== handler);
        }
    }

    /**
     * Calls all handlers subscribed to the event.
     * @param event - Event name.
     * @param payload - Data passed to the handler.
     */
    emit(event: string, payload?: any): void {
        if (this.listeners[event]) {
            // Execute on a copy of the array so handler removal inside a handler doesn't break the loop
            [...this.listeners[event]].forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`[SimpleEventEmitter] Error in handler for event "${event}":`, error);
                }
            });
        }
    }

    /**
     * Removes all subscribers for specified event or for all events.
     * @param event - Event name (optional). If not specified, removes all subscribers.
     */
    removeAllListeners(event?: string): void {
        if (event) {
            delete this.listeners[event];
        } else {
            this.listeners = {};
        }
    }
}