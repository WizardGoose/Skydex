import { describe, expect, it } from "vitest";
import { resolveLinkedTargetAddition } from "../linkedTarget";

const lookup = (...ids: string[]) => new Set(ids);

describe("Greenhouse linked targets", () => {
  it("resolves catalogue and mutation targets only when they are known", () => {
    expect(resolveLinkedTargetAddition(
      "rose_dragon_pet",
      [],
      lookup("dustgrain"),
      lookup("rose_dragon_pet"),
    )).toEqual({ id: "rose_dragon_pet", kind: "item", qty: 1 });
    expect(resolveLinkedTargetAddition(
      "dustgrain",
      [],
      lookup("dustgrain"),
      lookup(),
    )).toEqual({ id: "dustgrain", kind: "mutation", qty: 1 });
    expect(resolveLinkedTargetAddition("not_real", [], lookup(), lookup())).toBeNull();
  });

  it("does not replace or duplicate a saved goal", () => {
    const saved = [{ id: "rose_dragon_pet", kind: "item" as const, qty: 37 }];

    expect(resolveLinkedTargetAddition(
      "rose_dragon_pet",
      saved,
      lookup(),
      lookup("rose_dragon_pet"),
    )).toBeNull();
    expect(saved).toEqual([{ id: "rose_dragon_pet", kind: "item", qty: 37 }]);
  });
});
