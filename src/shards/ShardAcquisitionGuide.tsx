import { Plus, Repeat2 } from "lucide-react";
import { ItemIcon } from "../ui/ItemIcon";
import { acquisitionGuidanceFor } from "./acquisition";
import { shardAcquisitionGameText } from "./shardGameTextModel";
import { ShardGameText } from "./ShardGameTextView";
import "./shard-acquisition-guide.css";

// These are the same tool identities used by the capture suffixes. Match only
// stated methods; a generic instruction must never acquire a guessed tool.
const tools = [
  [/Pocket Black Hole/i, "Small Pocket Black Hole"],
  [/Lasso/i, "Abysmal Lasso"],
  [/Fishing Net/i, "Basic Fishing Net"],
  [/Hunting Traps/i, "Small Huntrap"],
  [/Critter Capsule/i, "Critter Capsule"],
  [/Kuudra/i, "Kuudra Key"],
  [/Star Bait/i, "Star Bait"],
] as const;

/** Explicit acquisition details, shared by target sources and route disclosures. */
export function ShardAcquisitionGuide({ shardKey, lines = acquisitionGuidanceFor(shardKey) }: {
  shardKey: string; lines?: readonly string[];
}) {
  return <div className="shards-acquisition-guide">
    {lines.length ? lines.map(line => {
      const text = shardAcquisitionGameText(shardKey, line) ?? line;
      const fusion = /^Fusing .+ with .+\.$/.test(line);
      const pair = fusion ? text.replace("Fusing ", "").replace(/\.$/, "").split("with ") : [];
      const tool = tools.find(([pattern]) => pattern.test(line))?.[1];
      return <div className={`shards-acquisition-step${fusion ? " is-fusion" : ""}`} key={line}>
        {fusion && pair.length === 2 ? <>
          <span className="shards-acquisition-step-label"><Repeat2 size={15} aria-hidden />Fusion</span>
          <div className="shards-acquisition-pair"><span><ShardGameText text={pair[0].trim()} /></span><Plus size={16} aria-label="with" /><span><ShardGameText text={pair[1].trim()} /></span></div>
        </> : <>
          {tool ? <ItemIcon name={tool} size={26} allowSemanticFallback={false} preferWikiIdentity freezeAnimatedMedia />
            : /^Charm /.test(line) ? <img src={`${import.meta.env.BASE_URL}shardIcons/${shardKey}.png`} alt="" width={26} height={26} /> : null}
          <p><ShardGameText text={text} /></p>
        </>}
      </div>;
    }) : <p>Acquisition details unavailable.</p>}
  </div>;
}
