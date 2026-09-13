import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("does not poison a shared username lookup when its first view unmounts", async () => {
  const { resolveAccount } = await import("../hypixel");
  const uuid = "b876ec32e396476ba1158438d83c67d4";
  let finish!: (response: Response) => void;
  const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    finish = resolve;
    if (init?.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  vi.stubGlobal("fetch", fetcher);
  const first = new AbortController();
  const a = resolveAccount("LookupPlayer", first.signal);
  first.abort();
  const b = resolveAccount("LookupPlayer", new AbortController().signal);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
  finish(Response.json({ data: { player: { raw_id: uuid, username: "LookupPlayer" } } }));
  expect(await b).toEqual({ ok: true, value: { uuid, name: "LookupPlayer" } });
  await a;
  expect((await resolveAccount("LookupPlayer")).ok).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not start or cache a lookup for an already cancelled caller", async () => {
  const { resolveAccount } = await import("../hypixel");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  controller.abort();
  expect((await resolveAccount("CancelledPlayer", controller.signal)).ok).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
