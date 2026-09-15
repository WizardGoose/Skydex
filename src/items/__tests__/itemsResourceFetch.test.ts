import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSkyblockItems } from "../itemsResourceFetch";

const okResponse = (items: unknown[]) =>
  new Response(JSON.stringify({ items }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSkyblockItems", () => {
  it("shares one fetch between concurrent callers", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse([{ id: "A" }])));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([fetchSkyblockItems(), fetchSkyblockItems()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{ id: "A" }]);
    expect(second).toEqual([{ id: "A" }]);
  });

  it("fetches again once the previous request has settled", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse([{ id: "B" }])));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSkyblockItems();
    await fetchSkyblockItems();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects on a non-OK response and retries on the next call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockImplementationOnce(() => Promise.resolve(okResponse([{ id: "C" }])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSkyblockItems()).rejects.toThrow("503");
    await expect(fetchSkyblockItems()).resolves.toEqual([{ id: "C" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves to an empty array when the payload has no items list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200 }))),
    );

    await expect(fetchSkyblockItems()).resolves.toEqual([]);
  });
});
