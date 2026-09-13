import type { WebMcpToolDefinition } from "./shared";

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(
        tool: WebMcpToolDefinition,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

/**
 * Register page-scoped tools through the imperative WebMCP API.
 * AbortController cleanup is the unregister operation defined by the API.
 */
export const registerWebMcpTools = (
  tools: readonly WebMcpToolDefinition[],
  signal: AbortSignal,
): boolean => {
  if (typeof document === "undefined" || !document.modelContext?.registerTool) return false;

  for (const tool of tools) {
    try {
      void Promise.resolve(
        document.modelContext.registerTool({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: tool.execute,
        }, { signal }),
      ).catch(() => {
        // One rejected registration must not prevent the remaining tools.
      });
    } catch {
      // Older experimental implementations may throw synchronously.
    }
  }
  return true;
};
