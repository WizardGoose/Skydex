import React from "react";
import { Tag } from "../ui/kit";

export interface NetworkStatusStripProps {
  hasChests: boolean;
  chestsMissing: boolean;
  inventoryPrivate: boolean;
  bankPrivate: boolean;
  museumPrivate: boolean;
  cataloguePartial: boolean;
  pricesError: string | null;
  rulesVersion: string;
}

/** Compact provenance/status labels; detail stays behind native disclosure/title text. */
export const NetworkStatusStrip: React.FC<NetworkStatusStripProps> = ({
  hasChests,
  chestsMissing,
  inventoryPrivate,
  bankPrivate,
  museumPrivate,
  cataloguePartial,
  pricesError,
  rulesVersion,
}) => (
  <div className="flex flex-wrap items-center gap-1.5 border-t border-white/8 px-3 py-2" data-network-status>
    {hasChests && (
      <Tag title="Island chests are valued conservatively; the companion snapshot carries fewer item modifiers.">
        Conservative chest values
      </Tag>
    )}
    {chestsMissing && <Tag title="Island chest contents have not been captured by the companion source.">Chests unavailable</Tag>}
    {inventoryPrivate && <Tag title="Inventory-dependent profile categories are private in the selected API snapshot.">Profile inventory private</Tag>}
    {bankPrivate && <Tag title="Co-op bank is not shared; it is shown as a dash rather than zero.">Co-op bank private</Tag>}
    {museumPrivate && <Tag title="Museum data is private or unavailable in the selected API snapshot.">Museum private</Tag>}
    {cataloguePartial && <Tag title="The item catalogue is partial, so some modifier values may be understated.">Catalogue partial</Tag>}
    {pricesError && <Tag title={pricesError}>Pricing partial</Tag>}
    <details className="ml-auto text-[10px] text-slate-500">
      <summary className="cursor-pointer hover:text-slate-300">Valuation source</summary>
      <span className="mt-1 block">SkyHelper-Networth {rulesVersion} · local price cache</span>
    </details>
  </div>
);

export default NetworkStatusStrip;
