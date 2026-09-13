import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { ItemTooltip } from "../../ui/ItemTooltip";
import { CalculationService } from "../../services/calculationService";
import type { Data, InventoryRecipeTree, Recipe, RecipeOverride } from "../../types/types";
import { equationsFor, replacementsFor, type FusionEquation } from "./equations";

export type RenderItem = (id: string, quantity?: number, onSelect?: () => void, selected?: boolean) => ReactNode;
export type Picker = { row: FusionEquation; slot: 0 | 1; anchor: HTMLElement };
type Props = {
  tree: InventoryRecipeTree | null; target: string; amount: number; data: Data;
  storage: ReadonlyMap<string, number>; overrides: RecipeOverride[]; busy: boolean;
  renderItem: RenderItem; cycleFallback: ReactNode;
  targetName?: string;
  storageContext?: "sample" | "available";
  onReplace: (output: string, recipe: Recipe | undefined) => Promise<boolean>;
};

export function ReplacementPicker({ picker, data, storage, overrides, busy, renderItem, onReplace, onClose, targetName, storageContext = "sample" }: Omit<Props, "tree" | "target" | "amount" | "cycleFallback"> & { picker: Picker; onClose: (restoreFocus?: boolean) => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const overlayId = useId();
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320, maxHeight: 400 });
  const { row, slot, anchor } = picker;
  const current = row.recipe.inputs[slot];
  const choices = useMemo(() => replacementsFor(row, slot, data).sort((a, b) =>
    (storage.get(b.itemId) ?? 0) - (storage.get(a.itemId) ?? 0) || data.shards[a.itemId].name.localeCompare(data.shards[b.itemId].name)
  ), [row, slot, data, storage]);
  const filtered = choices.filter(choice => data.shards[choice.itemId].name.toLowerCase().includes(query.trim().toLowerCase()));
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = document.documentElement;
      const width = Math.min(320, viewport.clientWidth - 16);
      const below = viewport.clientHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const down = below >= Math.min(360, above);
      const maxHeight = Math.max(100, Math.min(430, down ? below : above));
      const height = Math.min(surface.current?.scrollHeight ?? maxHeight, maxHeight);
      setPosition({ width, left: Math.max(8, Math.min(rect.left, viewport.clientWidth - width - 8)),
        top: Math.max(8, down ? rect.bottom + 6 : rect.top - height - 6), maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true); };
  }, [anchor, query]);
  useEffect(() => {
    search.current?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("skydex:item-tooltip-activate", { detail: { id: overlayId } }));
  }, [overlayId]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!surface.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(true); }
    };
    const blur = (event: FocusEvent) => {
      if (!surface.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", blur);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", blur); };
  }, [anchor, onClose]);
  const choose = async (recipe: Recipe | undefined) => {
    if (busy) return;
    if (await onReplace(row.output, recipe)) onClose(true);
  };
  return createPortal(<div className="equation-picker" ref={surface} role="dialog" aria-label={`Replace ${data.shards[current].name}`} style={position} aria-busy={busy}>
    <header><strong>Replace {data.shards[current].name}</strong><button aria-label="Close replacements" onClick={() => onClose(true)}><X size={16} /></button></header>
    <small>Keep {data.shards[row.recipe.inputs[1 - slot]].name} · all {data.shards[row.output].name} fusions for {targetName ?? "this target"}</small>
    <label className="profile-progression-search equation-picker-search"><Search size={13} aria-hidden /><input ref={search} aria-label="Search replacements" placeholder="Search shards" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="equation-picker-list">
      {filtered.map(({ itemId, recipe }) => {
        const isCurrent = CalculationService.getInstance().areRecipesEqual(recipe, row.recipe);
        return <div className="equation-choice" key={`${itemId}:${recipe.outputQuantity}:${recipe.isReptile}`}>
        {renderItem(itemId, data.shards[itemId].fuse_amount, () => { void choose(recipe); }, isCurrent)}
        <button className="equation-choice-label" disabled={busy} onClick={() => { void choose(recipe); }} aria-label={`Use ${data.shards[itemId].name}`}>
          <strong style={{ color: `var(--color-rarity-${data.shards[itemId].rarity})` }}>{data.shards[itemId].name}</strong>
          <small>{storageContext === "available" ? storage.has(itemId) ? `${storage.get(itemId)!.toLocaleString()} available` : "Storage unknown" : `${(storage.get(itemId) ?? 0).toLocaleString()} in storage`}</small>
          {recipe.outputQuantity !== row.recipe.outputQuantity && <small>{recipe.outputQuantity} per fusion</small>}
        </button>
        {isCurrent && <Check size={15} aria-label="Current ingredient" />}
      </div>;
      })}
      {!filtered.length && <p>No matching replacements.</p>}
    </div>
    <footer><small>{storageContext === "sample" ? "Sample storage · before this target" : "Available for this target"}</small>{overrides.some(override => override.shardId === row.output) &&
      <button disabled={busy} onClick={() => { void choose(undefined); }}><RotateCcw size={13} /> Automatic recipe</button>}</footer>
  </div>, document.body);
}

export function EquationBreakdown(props: Props) {
  const { tree, target, amount, data, storage, overrides, busy, renderItem, onReplace } = props;
  const { rows, hasCycle } = useMemo(() => equationsFor(tree, data), [tree, data]);
  const [picker, setPicker] = useState<Picker | null>(null);
  const anchors = useRef(new Map<string, HTMLDivElement>());
  const close = (restoreFocus = false) => {
    if (restoreFocus) picker?.anchor.querySelector("button")?.focus({ preventScroll: true });
    setPicker(null);
  };
  if (hasCycle) return <>{props.cycleFallback}</>;
  return <div className="equation-breakdown" aria-label={`${data.shards[target].name} fusion equations`}>
    <div className="equation-rows">{rows.map(row => {
      const produced = row.yield * row.repeats;
      return <div className="fusion-equation" key={row.id} aria-label={`${data.shards[row.output].name}, repeat ${row.repeats}`}>
        {([0, 1] as const).map(slot => <div className="equation-operand" key={slot}>
          {slot === 1 && <span className="equation-symbol" aria-hidden>+</span>}
          <div className="equation-input" ref={element => { if (element) anchors.current.set(`${row.id}:${slot}`, element); else anchors.current.delete(`${row.id}:${slot}`); }}>
            {renderItem(row.recipe.inputs[slot], row.inputs[slot], () => {
              if (!busy) setPicker({ row, slot, anchor: anchors.current.get(`${row.id}:${slot}`)! });
            }, picker?.row.id === row.id && picker.slot === slot)}
            <ChevronDown className="equation-chevron" size={11} aria-hidden />
          </div>
        </div>)}
        <span className="equation-symbol" aria-hidden>=</span>
        {renderItem(row.output, row.yield)}
        <ItemTooltip name={`${data.shards[row.output].name} batch`} sections={[{ lines: [
          ...row.recipe.inputs.map((id, slot) => `${(row.inputs[slot] * row.repeats).toLocaleString()} ${data.shards[id].name}`),
          `${produced.toLocaleString()} produced${produced > row.needed ? ` · ${row.needed.toLocaleString()} needed` : ""}`,
        ] }]}><button className="equation-repeat" aria-label={`${row.repeats} fusions, ${produced} ${data.shards[row.output].name} produced`}>×{row.repeats}</button></ItemTooltip>
      </div>;
    })}</div>
    <div className="equation-result">{renderItem(target, amount)}<strong style={{ color: `var(--color-rarity-${data.shards[target].rarity})` }}>{data.shards[target].name}</strong><small>{amount} to fuse</small></div>
    {picker && <ReplacementPicker picker={picker} data={data} storage={storage} overrides={overrides} busy={busy} renderItem={renderItem} onReplace={onReplace} onClose={close} />}
  </div>;
}
