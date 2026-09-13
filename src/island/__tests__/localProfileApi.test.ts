import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { localProfileApiProxy } from "../../../tools/localProfileApi";

describe("local profile relay", () => {
  const [pattern, proxy] = Object.entries(localProfileApiProxy())[0];

  it("only matches the existing profile read routes on a fixed service", () => {
    for (const route of ["snapshot", "profiles", "garden", "museum"]) {
      expect(new RegExp(pattern).test(`/__skydex-profile/v1/hypixel/${route}?uuid=abc`)).toBe(true);
    }
    for (const route of ["player", "snapshot/other", "snapshot-extra", "https://elsewhere.test"]) {
      expect(new RegExp(pattern).test(`/__skydex-profile/v1/hypixel/${route}`)).toBe(false);
    }
    expect(proxy.target).toBe("https://api.skydex.ca");
    expect(proxy.rewrite?.("/__skydex-profile/v1/hypixel/museum?profile=abc")).toBe("/v1/hypixel/museum?profile=abc");
  });

  it("preserves quota identity without forwarding local credentials or cookies", () => {
    const events = new EventEmitter();
    proxy.configure?.(events as Parameters<NonNullable<typeof proxy.configure>>[0], proxy);
    const headers = new Map<string, string>([
      ["cookie", "local-cookie"], ["authorization", "local-secret"],
      ["api-key", "local-key"], ["x-unrelated", "private-value"],
    ]);
    const outgoing = {
      getHeaderNames: () => [...headers.keys()],
      removeHeader: (name: string) => headers.delete(name),
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as ClientRequest;
    events.emit("proxyReq", outgoing, { headers: { "x-skydex-client-id": "anonymous-id" } });
    expect(Object.fromEntries(headers)).toEqual({
      host: "api.skydex.ca", accept: "application/json", origin: "http://localhost",
      "x-skydex-client-id": "anonymous-id",
    });
  });

  it("answers unsupported methods locally", async () => {
    const request = { method: "POST", url: "/__skydex-profile/v1/hypixel/snapshot" } as IncomingMessage;
    const response = { writeHead: vi.fn(), end: vi.fn() } as unknown as ServerResponse;
    expect(await proxy.bypass?.(request, response, proxy)).toBe(request.url);
    expect(response.writeHead).toHaveBeenCalledWith(405, { allow: "GET" });
    expect(response.end).toHaveBeenCalledOnce();
    expect(await proxy.bypass?.({ method: "GET" } as IncomingMessage, response, proxy)).toBeUndefined();
  });
});
