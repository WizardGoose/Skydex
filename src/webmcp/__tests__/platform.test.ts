import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMcpTools } from "../platform";
import type { WebMcpToolDefinition } from "../shared";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

const setDocument = (value: unknown) => {
  Object.defineProperty(globalThis, "document", {
    value,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

describe("imperative WebMCP registration", () => {
  it("feature-detects unsupported browsers", () => {
    setDocument({});
    expect(registerWebMcpTools([], new AbortController().signal)).toBe(false);
  });

  it("registers every page-scoped tool with the shared lifecycle signal", () => {
    const registerTool = vi.fn();
    setDocument({ modelContext: { registerTool } });
    const controller = new AbortController();
    const tools: WebMcpToolDefinition[] = [
      {
        name: "one",
        description: "First tool",
        inputSchema: { type: "object" },
        execute: () => ({ ok: true }),
      },
      {
        name: "two",
        description: "Second tool",
        inputSchema: { type: "object" },
        execute: () => ({ ok: true }),
      },
    ];

    expect(registerWebMcpTools(tools, controller.signal)).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining(tools[0]),
      { signal: controller.signal },
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining(tools[1]),
      { signal: controller.signal },
    );
  });

  it("contains the challenge-required literal imperative API call", () => {
    const source = readFileSync(resolve(process.cwd(), "src/webmcp/platform.ts"), "utf8");
    expect(source).toContain("document.modelContext.registerTool({");
  });
});
