import type { OpenRouterPlugin, Tool, OpenRouterRequestOptions, ChatCompletionResult } from '../types';
import type { OpenRouterClient } from '../client';
// Use relative path for ToolHandler import
import { ToolHandler } from '../tool-handler';

/**
 * Example plugin that modifies the tool registry used for chat calls.
 * It could fetch tools dynamically, add metadata, enforce policies by filtering, etc.
 * This example simply overrides/sets the tools for every chat call.
 *
 * @param tools - The array of Tool objects to be used, or a function returning them.
 */
export function createCustomToolRegistryPlugin(
    // Allow providing tools directly or via an async function for dynamic loading
    toolProvider: Tool[] | (() => Promise<Tool[]> | Tool[])
): OpenRouterPlugin {
  return {
    async init(client: OpenRouterClient) {
      const logger = client['logger']?.withPrefix('CustomToolRegistryPlugin');

      // Store the original chat method
      const originalChat = client.chat.bind(client);

      // Get the tools once or set up the provider function
      let resolvedTools: Tool[] | null = null;
      let isDynamic = false;
      if (typeof toolProvider === 'function') {
          isDynamic = true;
          logger?.log?.('Using dynamic tool provider function.');
      } else if (Array.isArray(toolProvider)) {
          // Validate and format tools immediately if provided as an array
          try {
             resolvedTools = toolProvider.map(ToolHandler.formatToolForAPI);
             logger?.log?.(`Initialized with ${resolvedTools.length} static tools.`);
          } catch (error) {
               logger?.error?.(`Failed to validate/format provided static tools: ${(error as Error).message}`);
               resolvedTools = []; // Set to empty on error? Or throw?
          }
      } else {
          logger?.error?.('Invalid toolProvider: must be an array or function.');
          return; // Don't modify chat if provider is invalid
      }

      // Override the client.chat method
      client.chat = async (options: OpenRouterRequestOptions): Promise<ChatCompletionResult> => {
        logger?.debug?.('Intercepting chat call...');

        let currentTools: Tool[] = [];

        // Resolve tools dynamically if necessary
        if (isDynamic) {
            try {
                const provided = await (toolProvider as () => Promise<Tool[]> | Tool[])();
                if (Array.isArray(provided)) {
                    // Validate and format dynamically provided tools
                    currentTools = provided.map(ToolHandler.formatToolForAPI);
                    logger?.debug?.(`Dynamically resolved ${currentTools.length} tools.`);
                } else {
                    logger?.warn?.('Dynamic tool provider did not return an array.');
                }
            } catch (error) {
                 logger?.error?.(`Error resolving tools from dynamic provider: ${(error as Error).message}`);
                 // Decide behavior on error: use empty tools, original tools, or throw?
                 currentTools = options.tools || []; // Fallback to original tools in options
            }
        } else {
            // Use the statically resolved tools
            currentTools = resolvedTools || [];
            logger?.debug?.(`Using ${currentTools.length} statically configured tools.`);
        }

        // --- Tool Merging/Overriding Logic ---
        // Decide how to handle tools passed in options vs tools from the plugin.
        // Option 1: Plugin overrides completely (current implementation)
        options.tools = currentTools;

        // Option 2: Merge (careful about duplicates)
        /*
        const combinedTools = [...(options.tools || [])];
        currentTools.forEach(pluginTool => {
            if (!combinedTools.some(optTool => optTool.function.name === pluginTool.function.name)) {
                combinedTools.push(pluginTool);
            } else {
                 logger?.debug?.(`Tool '${pluginTool.function.name}' from plugin skipped (already present in options).`);
            }
        });
        options.tools = combinedTools;
        logger?.debug?.(`Merged tools. Total: ${options.tools.length}`);
        */

       // Option 3: Plugin adds only if options.tools is empty
       /*
       if (!options.tools || options.tools.length === 0) {
           options.tools = currentTools;
           logger?.debug?.(`Applied plugin tools as none were provided in options.`);
       } else {
            logger?.debug?.(`Skipping plugin tools as tools were provided in options.`);
       }
       */

        // Call the original chat method with potentially modified options
        return originalChat(options);
      };

      // Ensure the overridden method has the same 'this' context if accessed differently (less common)
      // client.chat = client.chat.bind(client); // Re-bind might be necessary in some edge cases

      logger?.log?.('Custom tool registry plugin initialized and chat method overridden.');
    }
  };
}