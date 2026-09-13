import { useState, useEffect, useMemo } from "react";
import { BookOpen, Search, Menu, X } from "lucide-react";
import { ShardAutocomplete, RecipeCountBadge, ShardDisplay, DropdownButton } from "../components";
import { WikiLink } from "../ui/WikiLink";
import { wikiArticleUrl } from "../ui/wikiUrl";
import { getRarityColor } from "../utilities";
import { useFusionData, useDropdownManager, useRecipeState, useShardsWithRecipes } from "../hooks";
import { processOutputRecipes, categorizeAndGroupRecipes, filterCategorizedRecipes, type Recipe, type CategorizedRecipes, type GroupedRecipe, type FusionData } from "../utilities";
import {
  FOCUS,
  INPUT,
  PANEL,
  PageHeader,
  SectionHead,
  SplitPage,
  BTN_QUIET,
  EmptyState,
  Figure,
  BADGE,
  META,
  COL,
  Segmented,
} from "../ui/kit";
import type { ShardWithKey } from "../types/types";

type RecipeMode = "input" | "output" | null;

/*
 * The rail captions keep the page's directional coding: green marks the input
 * side, fuchsia the output side, the same key the count badge speaks. Kit
 * LABEL metrics with the hue swapped in, rather than LABEL plus a second text
 * colour class, so only one colour utility is ever in play.
 */
const RAIL_CAPTION = "font-mono text-[11px] font-medium uppercase tracking-[0.13em]";

export const RecipePage = () => {
  const { selectedShard, setSelectedShard, selectedOutputShard, setSelectedOutputShard } = useRecipeState();
  const { fusionData, loading } = useFusionData();

  const [searchValue, setSearchValue] = useState("");
  const [outputSearchValue, setOutputSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categorizedRecipes, setCategorizedRecipes] = useState<CategorizedRecipes>({
    special: [],
    id: [],
    chameleon: [],
  });
  const [mode, setMode] = useState<RecipeMode>(null);

  const [groupSelectionIndex, setGroupSelectionIndex] = useState<{ [groupKey: string]: number }>({});
  const [dropdownSearch, setDropdownSearch] = useState<{ [dropdownId: string]: string }>({});
  const groupDropdowns = useDropdownManager();

  /** Below the split breakpoint the rail collapses behind one button. */
  const [railOpen, setRailOpen] = useState(false);

  /*
   * The shard index in the rail, and which side a click on it fills.
   *
   * The two autocompletes answer "I know which shard I want"; they cannot
   * answer "show me what there is". The index is the browse half of the same
   * lookup, so it writes the same two pieces of state through the same two
   * handlers rather than owning a third selection of its own.
   */
  const { shards: allShards } = useShardsWithRecipes();
  const [indexQuery, setIndexQuery] = useState("");
  const [indexSide, setIndexSide] = useState<"input" | "output">("input");

  /*
   * The sharp channel. `--sd-split` is 0 by default, so a page that does not
   * open it is one unbroken sheet of frosted glass and the backdrop photograph
   * is never actually seen. This page opens it because its layout already puts
   * a full-height rail in exactly that column, so the split falls on a seam the
   * design already has rather than cutting across content.
   *
   * Opening it obliges the rail to be drawn on `.sd-glass` rather than on a
   * tint-only panel: over the sharp photograph a tint alone is not enough
   * material to set small text on. Removed on the way out so no other route
   * inherits the split.
   */
  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);

  const getInputRecipes = (shard: ShardWithKey, fusionData: FusionData): Recipe[] => {
    const recipes: Recipe[] = [];
    Object.entries(fusionData.recipes).forEach(([outputShardId, recipeData]) => {
      Object.entries(recipeData).forEach(([quantityStr, recipeList]) => {
        const outputQuantity = parseInt(quantityStr, 10);
        recipeList.forEach((recipe) => {
          if (recipe.length === 2) {
            const [input1, input2] = recipe;
            if (input1 === shard.key || input2 === shard.key) {
              recipes.push({ input1, input2, quantity: outputQuantity, output: outputShardId });
            }
          }
        });
      });
    });
    return recipes;
  };

  useEffect(() => {
    if (!fusionData) {
      setRecipes([]);
      setCategorizedRecipes({ special: [], id: [], chameleon: [] });
      setMode(null);
      return;
    }

    let newRecipes: Recipe[] = [];
    let newMode: RecipeMode = null;

    if (selectedShard && !selectedOutputShard) {
      newRecipes = getInputRecipes(selectedShard, fusionData);
      newMode = "input";
    } else if (selectedOutputShard && !selectedShard) {
      newRecipes = processOutputRecipes(selectedOutputShard, fusionData);
      newMode = "output";
    }

    setRecipes(newRecipes);
    setMode(newMode);

    if (newRecipes.length > 0) {
      setCategorizedRecipes(categorizeAndGroupRecipes(newRecipes, fusionData));
    } else {
      setCategorizedRecipes({ special: [], id: [], chameleon: [] });
    }
  }, [selectedShard, selectedOutputShard, fusionData]);

  const handleShardSelect = (shard: ShardWithKey) => {
    setMode("input");
    setSelectedShard(shard);
    setSelectedOutputShard(null);
    setOutputSearchValue("");
    setFilterValue("");
  };

  const handleOutputShardSelect = (shard: ShardWithKey) => {
    setMode("output");
    setSelectedOutputShard(shard);
    setSelectedShard(null);
    setSearchValue("");
    setFilterValue("");
  };

  const handleSearchInputFocus = () => searchValue && setSearchValue("");
  const handleOutputSearchInputFocus = () => outputSearchValue && setOutputSearchValue("");

  const filteredCategories: CategorizedRecipes = fusionData
    ? filterCategorizedRecipes(categorizedRecipes, filterValue, fusionData)
    : { special: [], id: [], chameleon: [] };
  const totalGroupBlocks = filteredCategories.special.length + filteredCategories.id.length + filteredCategories.chameleon.length;

  /**
   * What the fusion table holds, counted off the loaded data.
   *
   * Both figures are counts of rows already in hand rather than estimates: the
   * shard count is the index itself, and the recipe count walks every output
   * and every quantity bucket under it, which is the same traversal the lookup
   * above makes.
   */
  const dataset = useMemo(() => {
    if (!fusionData) return null;
    let recipeCount = 0;
    for (const byQuantity of Object.values(fusionData.recipes)) {
      for (const list of Object.values(byQuantity)) recipeCount += list.length;
    }
    return { shards: Object.keys(fusionData.shards).length, recipes: recipeCount };
  }, [fusionData]);

  /**
   * How many recipes each shard takes part in, on each side.
   *
   * One walk of the table fills both maps: an output key counts toward "makes",
   * and each of the two inputs of every recipe counts toward "uses". Built once
   * per dataset rather than per row, because the naive version is this same
   * walk repeated for all 189 rows.
   */
  const partOf = useMemo(() => {
    const makes = new Map<string, number>();
    const uses = new Map<string, number>();
    if (!fusionData) return { makes, uses };
    for (const [output, byQuantity] of Object.entries(fusionData.recipes)) {
      for (const list of Object.values(byQuantity)) {
        makes.set(output, (makes.get(output) ?? 0) + list.length);
        for (const pair of list) {
          for (const input of pair) uses.set(input, (uses.get(input) ?? 0) + 1);
        }
      }
    }
    return { makes, uses };
  }, [fusionData]);

  /** The index rows, narrowed by the index's own search box. */
  const indexRows = useMemo(() => {
    const q = indexQuery.trim().toLowerCase();
    return allShards
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allShards, indexQuery]);

  /**
   * Whether a lookup has been made at all.
   *
   * The per-lookup figures are dashes until then, never zeros: "you have not
   * asked yet" and "the answer is none" are different facts, and once a shard
   * IS chosen a zero is the honest answer and gets printed as one.
   */
  const asked = mode !== null;

  /*
   * The rail: one selection at a time. Picking on either side clears the
   * other, so the two boxes always describe a single lookup, and the filter
   * plus count only appear once that lookup has recipes to narrow.
   */
  const rail = (
    <>
      {/* Narrow viewports collapse the rail behind one button. */}
      <div className="min-[900px]:hidden">
        <button onClick={() => setRailOpen(!railOpen)} className={`${BTN_QUIET} w-full justify-center`}>
          {railOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span>{railOpen ? "Hide" : "Show"} Lookup</span>
        </button>
      </div>

      {/* `.sd-glass` rather than the kit's tint-only panel: this column sits in
          the sharp channel opened above, so its ground is the photograph itself
          rather than the curtain's already-blurred output. Radius and geometry
          stay the panel's. */}
      <section className={`${railOpen ? "block" : "hidden min-[900px]:block"} ws-panel sd-glass rounded-md`}>
        <div className="space-y-2.5 border-b border-white/8 p-2.5">
        <div className="flex flex-col gap-1.5">
          <div className={`${RAIL_CAPTION} text-green-300`}>Input Shard</div>
          <ShardAutocomplete
            value={searchValue}
            onChange={setSearchValue}
            onSelect={handleShardSelect}
            onFocus={handleSearchInputFocus}
            placeholder="Search for a shard..."
            className="w-full"
            searchMode="name-only"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className={`${RAIL_CAPTION} text-fuchsia-300`}>Output Shard</div>
          <ShardAutocomplete
            value={outputSearchValue}
            onChange={setOutputSearchValue}
            onSelect={handleOutputShardSelect}
            onFocus={handleOutputSearchInputFocus}
            placeholder="Search for a shard..."
            className="w-full"
            searchMode="name-only"
          />
        </div>

        {!loading && mode && recipes.length > 0 && (
          <div className="space-y-2 border-t border-white/8 pt-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="Filter recipes..."
                className={`${INPUT} w-full pl-8`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <RecipeCountBadge count={totalGroupBlocks} label="Recipe Groups" variant={mode === "input" ? "green" : "fuchsia"} />
          </div>
        )}
        </div>

        {/*
          The shard index: the browse half of the lookup.

          The two boxes above answer "I know which shard I want". Nothing on the
          page answered "show me what there is", so the column under them was
          empty and the only route into the tool was already knowing a name. The
          segmented control says which of the two boxes a click fills, so the
          index writes the existing selection rather than owning a third one.
        */}
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-2.5 py-2">
          <span className={COL}>Shard index</span>
          <Segmented
            ariaLabel="Which side a click on the index fills"
            options={[
              { value: "input", label: "input", title: "Clicking a shard looks up what it fuses into" },
              { value: "output", label: "output", title: "Clicking a shard looks up every recipe that makes it" },
            ]}
            value={indexSide}
            onChange={setIndexSide}
          />
        </div>

        <div className="px-2.5 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={indexQuery}
              onChange={(e) => setIndexQuery(e.target.value)}
              placeholder="Search the index"
              className={`${INPUT} w-full pl-8`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/*
          Sized to the window rather than to a fixed height, so the list shows
          as many rows as the viewport can carry instead of leaving a band of
          empty column underneath it. The subtrahend is the furniture above the
          list plus the 40px the shared rail reserves at its foot; `min-h` keeps
          a usable list on a short window.
        */}
        <div className="max-h-[calc(100vh-var(--sd-bar-h)-21.5rem)] min-h-[12rem] overflow-y-auto p-1">
          <div className="divide-y divide-white/8">
            {indexRows.map((shard) => {
              const makes = partOf.makes.get(shard.key) ?? 0;
              const uses = partOf.uses.get(shard.key) ?? 0;
              const chosen = selectedShard?.key === shard.key || selectedOutputShard?.key === shard.key;
              return (
                <button
                  key={shard.key}
                  type="button"
                  onClick={() => (indexSide === "input" ? handleShardSelect(shard) : handleOutputShardSelect(shard))}
                  title={`${shard.name}: ${uses.toLocaleString()} recipes use it, ${makes.toLocaleString()} recipes make it`}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-white/8 ${FOCUS} ${
                    chosen ? "bg-purple-500/15" : ""
                  }`}
                >
                  <img
                    src={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`}
                    alt=""
                    className="h-4 w-4 shrink-0 object-contain"
                    loading="lazy"
                  />
                  {/* 11px, the site's body size, on an explicit 18px line so the
                      row keeps its rhythm whatever the name's length. */}
                  <span className={`min-w-0 flex-1 truncate text-[11px] leading-[18px] ${getRarityColor(shard.rarity)}`}>
                    {shard.name}
                  </span>
                  <span
                    className={`${BADGE} w-8 shrink-0 text-right ${shard.isDirect ? "text-slate-400" : "text-slate-500"}`}
                    title={shard.isDirect ? "Can be obtained directly" : "No direct source, so it must be fused"}
                  >
                    {shard.isDirect ? "direct" : "fuse"}
                  </span>
                  <span className={`${META} w-9 shrink-0 text-right text-slate-500`} title="Recipes that use this shard">
                    {uses ? uses.toLocaleString() : "-"}
                  </span>
                  <span className={`${META} w-9 shrink-0 text-right text-slate-400`} title="Recipes that make this shard">
                    {makes ? makes.toLocaleString() : "-"}
                  </span>
                </button>
              );
            })}
          </div>
          {indexRows.length === 0 && <p className="px-1.5 py-2 text-[11px] text-slate-500">Nothing matches.</p>}
        </div>
      </section>
    </>
  );

  const header = (
    <PageHeader
      title="Fusion Recipes"
      sub="Look up what a shard can fuse into, or every recipe that produces it."
      icon={BookOpen}
    />
  );

  /*
    What the table holds and what this lookup found, as a strip of figures.

    The first two are properties of the dataset and are stated as soon as it
    loads. The rest belong to the current lookup and are dashes until a shard
    has been chosen, because a zero there would answer a question nobody asked.
  */
  const strip = (
    <div className={`${PANEL} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2`}>
      <Figure label="Shards" value={dataset ? dataset.shards.toLocaleString() : "-"} title="Every shard in the fusion table" />
      <Figure label="Recipes" value={dataset ? dataset.recipes.toLocaleString() : "-"} title="Every fusion the table lists" />
      <Figure
        label="Found"
        value={asked ? recipes.length.toLocaleString() : "-"}
        title={asked ? "Recipes matching the shard chosen in the rail" : "No shard chosen yet"}
      />
      <Figure
        label="Groups"
        value={asked ? totalGroupBlocks.toLocaleString() : "-"}
        title={asked ? "Those recipes folded into groups, after the rail's filter" : "No shard chosen yet"}
      />
      <Figure
        label="Special"
        value={asked ? filteredCategories.special.length.toLocaleString() : "-"}
        title="Family upgrades, which produce two shards"
      />
      <Figure
        label="ID"
        value={asked ? filteredCategories.id.length.toLocaleString() : "-"}
        title="Cross-family ladders, which produce one shard"
      />
      <Figure
        label="Chameleon"
        value={asked ? filteredCategories.chameleon.length.toLocaleString() : "-"}
        title="Chameleon fusions, which produce one shard"
      />
    </div>
  );

  if (loading && !fusionData) {
    return (
      <SplitPage railLabel="Recipe lookup" rail={rail}>
        {header}
        {strip}
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500/20 border-t-purple-500" />
        </div>
      </SplitPage>
    );
  }

  if (!fusionData) return null;

  const renderCategory = (groups: GroupedRecipe[], fusionType: "special" | "id" | "chameleon", heading: string, sub: string, colorClass: string) => {
    if (!groups.length) return null;

    return (
      /*
        One panel per fusion family, headed once.

        The heading was a centred 18px title with a 14px sentence under it,
        floating above an unlabelled box; as a panel with the kit's own section
        head it costs a third of the height, names the family and states what it
        yields on the same line, and the rows below it sit on a surface the rest
        of the site recognises.
      */
      <div className={PANEL}>
        <SectionHead
          title={heading}
          right={
            <span className="flex items-center gap-2">
              <span className={`${BADGE} ${colorClass}`}>{sub}</span>
              <span className={`${META} text-slate-500`}>{groups.length}</span>
            </span>
          }
        />
        <div
          className={
            // The trailing space matters: without it this concatenated into the
            // class "truncategrid-cols-1", which silently killed both `truncate`
            // and the grid column count.
            `grid gap-x-6 gap-y-2 p-3 truncate ` +
            (groups.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")
          }
        >
          {groups.map((group, idx) => {
            const gKey = `${fusionType}-${idx}`;

            // Matrix group (both sides variable, all combinations present)
            if (group.matrix && group.variantLeft && group.variantRight) {
              const outputId = group.output || group.recipes[0].output;

              // Get unique quantities in this matrix group
              const quantities = [...new Set(group.recipes.map((r) => r.quantity))];
              const hasMultipleQuantities = quantities.length > 1;

              // Matrix group uses dropdowns for both sides
              const leftDropdownId = `${gKey}-left`;
              const rightDropdownId = `${gKey}-right`;
              const selectedLeftIndex = groupSelectionIndex[`${gKey}-left`] || 0;
              const selectedRightIndex = groupSelectionIndex[`${gKey}-right`] || 0;
              const currentLeft = group.variantLeft[selectedLeftIndex];
              const currentRight = group.variantRight[selectedRightIndex];
              // Search state for dropdowns
              const leftSearch = dropdownSearch[leftDropdownId] || "";
              const rightSearch = dropdownSearch[rightDropdownId] || "";
              const filteredLeft = group.variantLeft!.filter((id) => !leftSearch || fusionData.shards[id]?.name.toLowerCase().includes(leftSearch.toLowerCase()));
              const filteredRight = group.variantRight!.filter((id) => !rightSearch || fusionData.shards[id]?.name.toLowerCase().includes(rightSearch.toLowerCase()));

              return (
                <div key={gKey} className="px-2">
                  <div className="flex flex-wrap items-center gap-2 lg:gap-3 min-w-0 min-h-[40px]">
                    {/* Left side dropdown */}
                    <div className="relative" ref={(el) => groupDropdowns.setRef(leftDropdownId, el)}>
                      <DropdownButton
                        isOpen={groupDropdowns.dropdownOpen[leftDropdownId]}
                        onClick={() => groupDropdowns.toggleDropdown(leftDropdownId)}
                        className="min-w-[120px]"
                      >
                        <ShardDisplay shardId={currentLeft} fusionData={fusionData} tooltipVisible={false} />
                      </DropdownButton>
                      {groupDropdowns.dropdownOpen[leftDropdownId] && (
                        <div className="absolute z-50 top-full mt-1 left-0 rounded-md border border-white/12 bg-slate-900 shadow-xl max-h-64 min-w-max flex flex-col">
                          <input
                            type="text"
                            className={`bg-white/5 text-white px-3 py-2 text-sm border-b border-white/8 ${FOCUS}`}
                            placeholder="Search..."
                            value={leftSearch}
                            onChange={(e) => setDropdownSearch((s) => ({ ...s, [leftDropdownId]: e.target.value }))}
                            autoFocus
                          />
                          <div className="overflow-auto max-h-48">
                            {filteredLeft.map((shardId) => (
                              <button
                                key={shardId}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/8 text-sm"
                                onClick={() => {
                                  setGroupSelectionIndex((p) => ({
                                    ...p,
                                    [`${gKey}-left`]: group.variantLeft!.indexOf(shardId),
                                  }));
                                  groupDropdowns.closeDropdown(leftDropdownId);
                                  setDropdownSearch((s) => ({ ...s, [leftDropdownId]: "" }));
                                }}
                              >
                                <ShardDisplay shardId={shardId} fusionData={fusionData} tooltipVisible={false} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-purple-400">+</span>

                    {/* Right side dropdown */}
                    <div className="relative" ref={(el) => groupDropdowns.setRef(rightDropdownId, el)}>
                      <DropdownButton
                        isOpen={groupDropdowns.dropdownOpen[rightDropdownId]}
                        onClick={() => groupDropdowns.toggleDropdown(rightDropdownId)}
                        className="min-w-[120px]"
                      >
                        <ShardDisplay shardId={currentRight} fusionData={fusionData} tooltipVisible={false} />
                      </DropdownButton>
                      {groupDropdowns.dropdownOpen[rightDropdownId] && (
                        <div className="absolute z-50 top-full mt-1 left-0 rounded-md border border-white/12 bg-slate-900 shadow-xl max-h-64 min-w-max flex flex-col">
                          <input
                            type="text"
                            className={`bg-white/5 text-white px-3 py-2 text-sm border-b border-white/8 ${FOCUS}`}
                            placeholder="Search..."
                            value={rightSearch}
                            onChange={(e) => setDropdownSearch((s) => ({ ...s, [rightDropdownId]: e.target.value }))}
                            autoFocus
                          />
                          <div className="overflow-auto max-h-48">
                            {filteredRight.map((shardId) => (
                              <button
                                key={shardId}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/8 text-sm"
                                onClick={() => {
                                  setGroupSelectionIndex((p) => ({
                                    ...p,
                                    [`${gKey}-right`]: group.variantRight!.indexOf(shardId),
                                  }));
                                  groupDropdowns.closeDropdown(rightDropdownId);
                                  setDropdownSearch((s) => ({ ...s, [rightDropdownId]: "" }));
                                }}
                              >
                                <ShardDisplay shardId={shardId} fusionData={fusionData} tooltipVisible={false} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-purple-400">=</span>

                    {/* Output display */}
                    {hasMultipleQuantities ? (
                      <div className="flex items-center gap-1">
                        <ShardDisplay shardId={outputId} fusionData={fusionData} tooltipVisible={false} />
                        <span className="text-xs text-slate-400">({quantities.sort((a, b) => b - a).join("/")})x</span>
                      </div>
                    ) : (
                      <ShardDisplay shardId={outputId} quantity={quantities[0]} fusionData={fusionData} />
                    )}

                    <span className="text-xs text-slate-400 ml-1">({group.recipes.length} recipes)</span>
                  </div>
                </div>
              );
            }

            if (group.isGroup) {
              const selectedIdx = groupSelectionIndex[gKey] || 0;
              const activeRecipe = group.recipes[selectedIdx];
              const leftCommon = group.commonPosition === "input1";
              const rightCommon = group.commonPosition === "input2";

              const renderVariantDropdown = (side: "left" | "right") => {
                const shardList = [...new Set(group.recipes.map((r) => (side === "left" ? r.input1 : r.input2)))];
                const dropdownId = `${gKey}-${side}`;
                const currentShard = side === "left" ? activeRecipe.input1 : activeRecipe.input2;
                const search = dropdownSearch[dropdownId] || "";
                const filteredList = shardList.filter((id) => !search || fusionData.shards[id]?.name.toLowerCase().includes(search.toLowerCase()));
                return (
                  <div className="relative" ref={(el) => groupDropdowns.setRef(dropdownId, el)}>
                    <DropdownButton
                      isOpen={groupDropdowns.dropdownOpen[dropdownId]}
                      onClick={() => groupDropdowns.toggleDropdown(dropdownId)}
                      className="min-w-[120px]"
                    >
                      <ShardDisplay shardId={currentShard} fusionData={fusionData} tooltipVisible={false} />
                    </DropdownButton>
                    {groupDropdowns.dropdownOpen[dropdownId] && (
                      <div className="absolute z-50 top-full mt-1 left-0 rounded-md border border-white/12 bg-slate-900 shadow-xl max-h-64 min-w-max flex flex-col">
                        <input
                          type="text"
                          className={`bg-white/5 text-white px-3 py-2 text-sm border-b border-white/8 ${FOCUS}`}
                          placeholder="Search..."
                          value={search}
                          onChange={(e) => setDropdownSearch((s) => ({ ...s, [dropdownId]: e.target.value }))}
                          autoFocus
                        />
                        <div className="overflow-auto max-h-48">
                          {filteredList.map((shardId) => {
                            const recipeIdx = group.recipes.findIndex((r) => (side === "left" ? r.input1 : r.input2) === shardId);
                            return (
                              <button
                                key={shardId}
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/8 text-sm"
                                onClick={() => {
                                  setGroupSelectionIndex((p) => ({ ...p, [gKey]: recipeIdx }));
                                  groupDropdowns.closeDropdown(dropdownId);
                                  setDropdownSearch((s) => ({ ...s, [dropdownId]: "" }));
                                }}
                              >
                                <ShardDisplay shardId={shardId} fusionData={fusionData} tooltipVisible={false} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              };

              let actualOutput = "";
              if (mode === "output" && selectedOutputShard) {
                actualOutput = selectedOutputShard.key;
              } else if (mode === "input") {
                actualOutput = activeRecipe.output;
              } else if (activeRecipe.output) {
                actualOutput = activeRecipe.output;
              }

              return (
                <div key={gKey} className="px-2">
                  <div className="flex flex-wrap items-center gap-2 lg:gap-3 min-w-0 min-h-[40px]">
                    {leftCommon ? <ShardDisplay shardId={group.commonShard} fusionData={fusionData} tooltipVisible={false} /> : renderVariantDropdown("left")}
                    <span className="text-purple-400">+</span>
                    {rightCommon ? <ShardDisplay shardId={group.commonShard} fusionData={fusionData} tooltipVisible={false} /> : renderVariantDropdown("right")}
                    <span className="text-purple-400">=</span>
                    <ShardDisplay shardId={actualOutput} quantity={activeRecipe.quantity} fusionData={fusionData} />
                  </div>
                </div>
              );
            }

            const recipe = group.recipes[0];

            let actualOutput = "";
            if (mode === "output" && selectedOutputShard) {
              actualOutput = selectedOutputShard.key;
            } else if (mode === "input") {
              actualOutput = recipe.output;
            } else if (recipe.output) {
              actualOutput = recipe.output;
            }

            return (
              <div key={gKey} className={groups.length === 1 ? "" : "px-2"}>
                <div className="flex items-center gap-2 lg:gap-3 min-w-0 min-h-[40px]">
                  <ShardDisplay shardId={recipe.input1} fusionData={fusionData} tooltipVisible={false} />
                  <span className="text-purple-400">+</span>
                  <ShardDisplay shardId={recipe.input2} fusionData={fusionData} tooltipVisible={false} />
                  <span className="text-purple-400">=</span>
                  <ShardDisplay shardId={actualOutput} quantity={recipe.quantity} fusionData={fusionData} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <SplitPage railLabel="Recipe lookup" rail={rail}>
      {header}
      {strip}

      {/* The question the results answer, restated over them so the reading
          column carries its own context once a shard is chosen in the rail. */}
      {selectedShard && (
        <div className="flex items-center gap-1 text-[12px]">
          <span className="text-slate-300">What can you make with</span>
          <img
            src={`${import.meta.env.BASE_URL}shardIcons/${selectedShard.key}.png`}
            alt={selectedShard.name}
            className="w-4 h-4 object-contain"
            loading="lazy"
          />
          {/* The icon is right there already, so this is the name only.
              Shard articles are titled "<Name> Shard" on the wiki. */}
          <WikiLink
            name={selectedShard.name}
            href={wikiArticleUrl(`${selectedShard.name} Shard`)}
            className={`font-semibold ${getRarityColor(selectedShard.rarity)}`}
          />
          <span className="text-slate-400">?</span>
        </div>
      )}
      {selectedOutputShard && (
        <div className="flex items-center justify-center gap-1 text-sm">
          <span className="text-slate-300">How to make</span>
          <img
            src={`${import.meta.env.BASE_URL}shardIcons/${selectedOutputShard.key}.png`}
            alt={selectedOutputShard.name}
            className="w-4 h-4 object-contain"
            loading="lazy"
          />
          <WikiLink
            name={selectedOutputShard.name}
            href={wikiArticleUrl(`${selectedOutputShard.name} Shard`)}
            className={`font-semibold ${getRarityColor(selectedOutputShard.rarity)}`}
          />
          <span className="text-slate-400">?</span>
        </div>
      )}

      {mode && recipes.length > 0 ? (
        <div className="space-y-3">
          {renderCategory(filteredCategories.special, "special", "Special Fusions", "Produces 2 shards", "text-yellow-400")}
          {renderCategory(filteredCategories.id, "id", "ID Fusions", "Produces 1 shard", "text-blue-400")}
          {renderCategory(filteredCategories.chameleon, "chameleon", "Chameleon Fusions", "Produces 1 shard", "text-green-400")}
          {totalGroupBlocks === 0 && (
            <div className={PANEL}>
              <EmptyState
                icon={Search}
                title="Nothing matches that filter"
                hint="This shard does have recipes, but none of them match the text in the rail's filter box. Clear it to see them all again."
              />
            </div>
          )}
        </div>
      ) : mode && recipes.length === 0 ? (
        <div className={PANEL}>
          <EmptyState
            icon={BookOpen}
            title={mode === "input" ? "No fusion recipes use this shard" : "No recipes produce this shard"}
            hint={
              mode === "input"
                ? "The fusion table lists no recipe taking this shard as an input, so it is an end of its line rather than a step in one."
                : "The fusion table lists no recipe producing this shard, so it is obtained directly rather than fused."
            }
          />
        </div>
      ) : (
        <div className={PANEL}>
          <EmptyState
            icon={Search}
            title="Pick a shard to look up"
            hint="Choose an input shard in the rail to see what it fuses into, or an output shard to see every recipe that makes it."
          />
        </div>
      )}
    </SplitPage>
  );
};

export default RecipePage;
