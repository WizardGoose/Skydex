import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importPlayerProfile, type HypixelProfileResponse } from "../profileImport";
import { fetchProfileMembers, resolveAccount } from "../../island/hypixel";
import { writeAccess } from "../../island/apiKey";
import { readShardProfileSignals } from "../profileAssumptions";

vi.mock("../../island/apiKey", () => ({
  currentAccess: () => ({ key: "", uuid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Example" }),
  writeAccess: vi.fn(),
}));
vi.mock("../../island/hypixel", () => ({ fetchProfileMembers: vi.fn(), resolveAccount: vi.fn() }));
vi.mock("../profileAssumptions", () => ({ readShardProfileSignals: vi.fn() }));

const catalogue = [{ key: "C1", name: "Grove", internal_id: "SHARD_GROVE", rarity: "common" }];
const signals = { huntingXp: null, huntersLuck: null, kuudraTier: null, attributeStacks: null, itemFortune: { available: false, total: 0, parts: [], davidCloakEquipped: false } };
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("progressive shard profile loading", () => {
  it("publishes real counts before optional equipment has finished", async () => {
    const fetchedAt = Date.now() - 2_000;
    vi.mocked(fetchProfileMembers).mockResolvedValue({ ok: true, fetchedAt, value: [{ profileId: "p1", cuteName: "Apple", gameMode: null, selected: true, member: { shards: { owned: [{ type: "GROVE", amount_owned: 7 }] }, attributes: { stacks: {} } } }] });
    let finish!: (value: typeof signals) => void;
    vi.mocked(readShardProfileSignals).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const counts = vi.fn<(response: HypixelProfileResponse) => void>();
    const pending = importPlayerProfile("Example", catalogue, undefined, false, counts);
    await vi.waitFor(() => expect(counts).toHaveBeenCalledOnce());
    const early = counts.mock.calls[0][0];
    expect(early.fetchedAt).toBe(fetchedAt);
    expect(early.profiles[0].shards[0].amount).toBe(7);
    expect(early.profiles[0].attributesRead).toBe(true);
    expect(early.profiles[0].signals.itemFortune.available).toBe(false);
    finish(signals);
    expect((await pending).ok).toBe(true);
  });

  it("hydrates only the connected account cache without a name lookup or fresh timestamp", async () => {
    const fetchedAt = Date.now() - 172_800_000;
    vi.mocked(fetchProfileMembers).mockResolvedValue({ ok: true, fetchedAt, cacheState: "browser-stale", value: [{ profileId: "p1", cuteName: "Apple", gameMode: null, selected: true, member: {} }] });
    vi.mocked(readShardProfileSignals).mockResolvedValue(signals);
    const cached = await importPlayerProfile("Example", catalogue, undefined, true);
    expect(fetchProfileMembers).toHaveBeenCalledWith({ uuid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Example" }, "", undefined, true);
    expect(readShardProfileSignals).toHaveBeenCalledWith({}, undefined, true);
    expect(resolveAccount).not.toHaveBeenCalled();
    expect(writeAccess).not.toHaveBeenCalled();
    expect(cached.ok && cached.value.fetchedAt).toBe(fetchedAt);
    expect(cached.ok && cached.value.profiles[0].shardsRead).toBe(false);
    expect(cached.ok && cached.value.profiles[0].attributesRead).toBe(false);
  });
});
