import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SolvedGridView } from "../SolvedGridView";

describe("the solved-board render boundary", () => {
  it("does not make every unchanged route board render again when planner progress changes", () => {
    // A progress click changes route timings, not the solved layouts. RouteLine
    // can contain dozens of 100-cell boards, so this boundary is the difference
    // between updating the counters and rebuilding thousands of DOM nodes.
    expect((SolvedGridView as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  it("makes occupied cells inspectable only when the caller owns item details", () => {
    const result = {
      status: "OPTIMAL",
      placements: [{ crop: "wheat", position: [0, 0] as [number, number], size: 1 }],
      mutations: [{ mutation: "dustgrain", position: [1, 1] as [number, number], size: 1 }],
    };
    const data = {
      crops: {
        wheat: {
          id: "wheat",
          name: "Wheat",
          size: 1,
          priority: 1,
          ground: "farmland",
          growth_stages: 8,
          positive_buffs: [],
          negative_buffs: [],
        },
      },
      mutations: {
        dustgrain: {
          id: "dustgrain",
          name: "Dustgrain",
          size: 1,
          ground: "farmland",
          requirements: [{ crop: "wheat", count: 4 }],
          rarity: "COMMON",
          growth_stages: 8,
          positive_buffs: [],
          negative_buffs: [],
          drops: {},
        },
      },
    };

    const locked = renderToStaticMarkup(
      <SolvedGridView result={result} data={data} onOpenItem={() => undefined} />,
    );
    const thumbnail = renderToStaticMarkup(<SolvedGridView result={result} data={data} />);

    expect(locked).toContain('aria-label="Open Wheat details"');
    expect(locked).toContain('aria-label="Open Dustgrain details"');
    expect(locked).toContain("is-inspectable");
    expect(thumbnail).not.toContain("is-inspectable");
    expect(thumbnail).not.toContain("aria-label=\"Open Wheat details\"");
  });

  it("labels delayed mutation cells by dependency wave without changing ordinary previews", () => {
    const result = {
      status: "DELAYED",
      placements: [],
      mutations: [
        { mutation: "veilshroom", position: [3, 3] as [number, number], size: 1 },
        { mutation: "thornshade", position: [4, 4] as [number, number], size: 1 },
      ],
    };
    const mutation = (id: string, name: string) => ({
      id,
      name,
      size: 1,
      ground: "farmland" as const,
      requirements: [],
      rarity: "COMMON" as const,
      growth_stages: 0,
      positive_buffs: [],
      negative_buffs: [],
      drops: {},
    });
    const data = {
      crops: {},
      mutations: {
        veilshroom: mutation("veilshroom", "Veilshroom"),
        thornshade: mutation("thornshade", "Thornshade"),
      },
    };

    const staged = renderToStaticMarkup(
      <SolvedGridView
        result={result}
        data={data}
        mutationWaveByPlacement={{ "veilshroom@3,3": 0, "thornshade@4,4": 1 }}
      />,
    );
    const ordinary = renderToStaticMarkup(<SolvedGridView result={result} data={data} />);

    expect(staged).toContain("is-wave-0");
    expect(staged).toContain("is-wave-1");
    expect(staged).toContain("Step 1: Veilshroom grows here");
    expect(staged).toContain("Step 2: Thornshade grows here after its inputs appear");
    expect(ordinary).not.toContain("is-wave-");
  });
});
