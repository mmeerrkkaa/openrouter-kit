// Path: src/core/message-preparer.ts
import { Message, HistoryEntry } from '../types';
import { UnifiedHistoryManager } from '../history/unified-history-manager';
import { Logger } from '../utils/logger';
import { ConfigError } from '../utils/error';

/**
 * Filters an array of message objects for sending to the API.
 */
export function filterHistoryForApi(messages: Message[]): Message[] {
    if (!Array.isArray(messages)) {
        return [];
    }
    return messages.map(msg => {
        const filteredMsg: Partial<Message> = { role: msg.role };
        if (msg.content !== null && msg.content !== undefined) {
            filteredMsg.content = msg.content;
        } else {
            filteredMsg.content = null;
        }
        if (msg.tool_calls) {
            filteredMsg.tool_calls = msg.tool_calls;
        }
        if (msg.tool_call_id) {
            filteredMsg.tool_call_id = msg.tool_call_id;
        }
        if (msg.name) {
            filteredMsg.name = msg.name;
        }
        return filteredMsg as Message;
    }).filter(msg => msg !== null);
}

/**
 * Prepares the list of messages to be sent to the API.
 */
export async function prepareMessagesForApi(
    params: {
        user?: string;
        group?: string | null;
        prompt: string;
        systemPrompt?: string | null;
        customMessages?: Message[] | null;
        _loadedHistoryEntries?: HistoryEntry[];
        getHistoryKeyFn: (user: string, group?: string | null) => string;
    },
    historyManager: UnifiedHistoryManager,
    logger: Logger
): Promise<Message[]> {
    const { user, group, prompt, systemPrompt, customMessages, _loadedHistoryEntries } = params;

    if (customMessages) {
        logger.debug(`Using provided customMessages (${customMessages.length} items).`);
        let finalMessages = [...customMessages];
        const hasSystem = finalMessages.some(m => m.role === 'system');
        if (systemPrompt && !hasSystem) {
            logger.debug('Prepending systemPrompt to customMessages.');
            finalMessages.unshift({ role: 'system', content: systemPrompt });
        } else if (systemPrompt && hasSystem) {
            logger.warn('Both `systemPrompt` and a system message in `customMessages` were provided. Using the one from `customMessages`.');
        }
        return finalMessages.map(m => ({ ...m, content: m.content ?? null }));
    }

    const loadedMessages = _loadedHistoryEntries ? _loadedHistoryEntries.map(entry => entry.message) : [];

    if (!prompt && !systemPrompt) {
        if (loadedMessages.length === 0) {
            throw new ConfigError("'prompt' must be provided if 'customMessages' is not used and history is empty");
        } else {
            logger.warn("Neither 'prompt' nor 'systemPrompt' provided, proceeding with history only.");
        }
    }

    let messages: Message[] = [];

    if (loadedMessages.length > 0) {
        logger.debug(`Using pre-loaded history (${loadedMessages.length} messages). Filtering...`);
        const filteredHistory = filterHistoryForApi(loadedMessages);
        messages = [...messages, ...filteredHistory];
        logger.debug(`Added ${filteredHistory.length} filtered messages from pre-loaded history.`);
    }

    if (systemPrompt && !messages.some(m => m.role === 'system')) {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    if (prompt) {
        messages.push({ role: 'user', content: prompt });
    }

    logger.debug(`${messages.length} messages prepared for API request.`);
    return messages.map(m => ({ ...m, content: m.content ?? null }));
}

export {};