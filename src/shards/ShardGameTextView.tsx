import React from "react";
import { parseMinecraftText } from "../ui/itemTooltipModel";

/** Exported shard fragments rendered by the same Minecraft-text parser as Profile lore. */
export const ShardGameText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span className={className}>
    {parseMinecraftText(text).map((segment, index) => (
      <span className={segment.className} key={`${segment.text}-${index}`}>
        {/* The shared parser resolves known stat glyphs. Unmapped pack-only icons
            have no browser font; retain their adjacent name without a tofu box. */}
        {segment.text.replace(/[\uE000-\uF8FF]/g, "")}
      </span>
    ))}
  </span>
);
