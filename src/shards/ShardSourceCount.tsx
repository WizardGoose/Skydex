import type { ReactNode } from "react";
import { CircleHelp, Package, Repeat2, ShoppingCart, TreeDeciduous } from "lucide-react";
import { ItemIcon } from "../ui/ItemIcon";
import { UtilityInfo } from "../profile-view/UtilityMetric";
import { ShardAcquisitionGuide } from "./ShardAcquisitionGuide";

const TOOL_IMAGES: Record<string, string> = {
  Lasso: "Abysmal Lasso",
  "Fishing Net": "Basic Fishing Net",
  "Black Hole": "Small Pocket Black Hole",
  Fishing: "Fishing Rod",
  Fish: "Fishing Rod",
  Traps: "Small Huntrap",
  Kuudra: "Kuudra Key",
  "End Stone Protector": "End Stone Protector",
  "Star Bait": "Star Bait",
  "Critter Capsule": "Critter Capsule",
};

function MethodIcon({ method }: { method: string }) {
  if (method === "Bazaar" || method === "Shop") return <ShoppingCart size={14} aria-hidden />;
  if (method === "Tree Gifts") return <TreeDeciduous size={14} aria-hidden />;
  const image = TOOL_IMAGES[method];
  return image ? <ItemIcon name={image} size={18} allowSemanticFallback={false} preferWikiIdentity freezeAnimatedMedia /> : <CircleHelp size={14} aria-hidden />;
}

export function ShardMethodIcons({ methods }: { methods: string[] }) {
  return <span className="shards-method-icons" aria-label={methods.join(" / ")}>{methods.flatMap(method => method.split(" + ")).map((method, index) => <MethodIcon key={`${method}:${index}`} method={method} />)}</span>;
}

export function ShardAcquisitionSuffix({ name, methods, shardKey }: { name: string; methods: string[]; shardKey?: string }) {
  if (!methods.length) return null;
  const label = methods.map(method => method === "Kuudra" ? "Kuudra reward chest" : method).join(" / ");
  return <UtilityInfo activation="click" title={`${name} acquisition`} info={{ summary: shardKey && !methods.includes("Bazaar") ? undefined : label }} className="shards-method"
    details={shardKey && !methods.includes("Bazaar") ? <ShardAcquisitionGuide shardKey={shardKey} /> : undefined}>
    <button type="button" className="shards-method-button">{methods.flatMap(method => method.split(" + ")).map((method, index) => <MethodIcon key={`${method}:${index}`} method={method} />)}</button>
  </UtilityInfo>;
}

export function ShardSourceCount({ quantity, source, methods = [], onInspect, expanded, controls, name, labelled = false }: { quantity: number; source: "storage" | "fusion" | "cycle" | "acquire" | "reused"; methods?: string[]; onInspect?: () => void; expanded?: boolean; controls?: string; name?: string; labelled?: boolean }) {
  const count = Math.ceil(quantity).toLocaleString();
  const label = source === "acquire" ? `${count} ${methods.includes("Bazaar") ? "to buy" : "to gather"}${methods.length ? ` · ${methods.join(" / ")}` : ""}`
    : source === "reused" ? `${count} reused in cycle` : `${count} from ${source}`;
  const icons: ReactNode = source === "storage" ? <Package size={14} aria-hidden />
    : source === "acquire" ? (methods.length ? methods : ["Gathering"]).flatMap(method => method.split(" + ")).map((method, index) => <MethodIcon key={`${method}:${index}`} method={method} />)
    : <Repeat2 size={14} aria-hidden />;
  const sourceName = source === "acquire" ? methods.includes("Bazaar") ? "Buy" : "Gather" : source === "reused" ? "Reused" : source[0].toUpperCase() + source.slice(1);
  const contents = <><span className="shards-source-icons" aria-hidden>{icons}</span>{labelled && <span>{sourceName}</span>}<b>{count}</b></>;
  if (onInspect) return <button type="button" className={`shards-source-count is-${source}`} onClick={onInspect}
    aria-expanded={expanded} aria-controls={controls} aria-label={`${label}; ${expanded ? "hide" : "show"} ${name} ingredients`}>{contents}</button>;
  return <UtilityInfo activation="click" title={label} ariaLabel={label} info={{ summary: source === "storage" ? "Allocated from held shards." : source === "fusion" ? "Made by the ingredient recipes." : source === "cycle" || source === "reused" ? "Circulated through the fusion cycle." : "Additional shards to acquire." }} className="shards-source-count-wrap">
    <button type="button" className={`shards-source-count is-${source}`}>{contents}</button>
  </UtilityInfo>;
}
