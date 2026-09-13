import React from "react";
import { Ban, FishOff, Package, ShoppingCart } from "lucide-react";
import type { CalculationFormData } from "../schemas";
import { FOCUS, ToggleRow } from "../ui/kit";
import { UtilityInfo } from "../profile-view/UtilityMetric";

type RouteFlag = "excludeChameleon" | "noWoodenBait" | "instantBuyPrices" | "useHeldShards";

export const ShardRouteToggles: React.FC<{
  ironman: boolean;
  toolbar?: boolean;
  storageOptions?: React.ReactNode;
  form: Pick<CalculationFormData, RouteFlag>;
  onChange: (key: RouteFlag, value: boolean) => void;
}> = ({ ironman, toolbar = false, storageOptions, form, onChange }) => {
  if (toolbar) {
    const options = ironman ? [
      { key: "excludeChameleon" as const, label: "Exclude Chameleon", hint: "Do not use Chameleon as a direct source.", Icon: Ban },
      { key: "noWoodenBait" as const, label: "Exclude Wooden Bait", hint: "Reduce reliance on wooden-bait catches.", Icon: FishOff },
    ] : [
      { key: "instantBuyPrices" as const, label: "Use instant-buy prices", hint: "Use Bazaar instant-buy prices instead of buy orders.", Icon: ShoppingCart },
    ];
    return <>
      <UtilityInfo control title="Use storage" info={{ summary: "Use shards in storage across the queue. Protected shards stay in storage." }}><button type="button" className={`shards-toolbar-toggle ${FOCUS}${form.useHeldShards !== false ? " is-active" : ""}`} aria-pressed={form.useHeldShards !== false} onClick={() => onChange("useHeldShards", form.useHeldShards === false)}><Package aria-hidden /><span>Use storage</span></button></UtilityInfo>
      {storageOptions}
      {options.map(({ key, label, hint, Icon }) => <UtilityInfo control key={key} title={label} info={{ summary: hint }}><button type="button" className={`shards-toolbar-toggle ${FOCUS}${form[key] ? " is-active" : ""}`} aria-pressed={form[key]} onClick={() => onChange(key, !form[key])}><Icon aria-hidden /><span>{label}</span></button></UtilityInfo>)}
    </>;
  }
  return ironman ? (
  <>
    <ToggleRow label="Exclude Chameleon" checked={form.excludeChameleon} onChange={(value) => onChange("excludeChameleon", value)} hint="Do not use Chameleon as a direct source." />
    <ToggleRow label="Exclude Wooden Bait" checked={form.noWoodenBait} onChange={(value) => onChange("noWoodenBait", value)} hint="Reduce reliance on wooden-bait catches." />
  </>
) : (
  <ToggleRow label="Use instant-buy prices" checked={form.instantBuyPrices} onChange={(value) => onChange("instantBuyPrices", value)} />
);
};
