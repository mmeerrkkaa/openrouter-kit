import type { OpenRouterPlugin, Tool } from '../types';
import type { OpenRouterClient } from '../client';

/**
 * Example plugin that adds a custom tool registry.
 * Could fetch tools dynamically, add metadata, enforce policies, etc.
 */
export function createCustomToolRegistryPlugin(tools: Tool[]): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const originalChat = client.chat.bind(client);

      client.chat = async function(options) {
        options.tools = tools;
        return originalChat(options);
      } as typeof client.chat;

      client['logger']?.log?.('Custom tool registry plugin initialized');
    }
  };
}