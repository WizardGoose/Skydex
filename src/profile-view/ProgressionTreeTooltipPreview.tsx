import React from "react";
import type { ProfileLoadoutContextView } from "../profile/profileViewModel";
import { ProgressionTreeGraph } from "./ProgressionTreeGraph";
import {
  progressionNodeState,
  progressionTiers,
  progressionUnlockedTier,
  resolveProgressionNode,
  type ProgressionKind,
  type ProgressionNodeState,
} from "./progressionGuiModel";

interface ProgressionTreeTooltipPreviewProps {
  context: ProfileLoadoutContextView;
}

export const ProgressionTreeTooltipPreview: React.FC<ProgressionTreeTooltipPreviewProps> = ({ context }) => {
  const detail = context.detail?.kind === "tree" ? context.detail : null;
  if (!detail) return null;

  const kind: ProgressionKind = context.tone === "hotf" ? "hotf" : "hotm";
  const tiers = progressionTiers(kind);
  const unlockedTier = progressionUnlockedTier(kind, detail.experience, tiers, detail.nodes);
  const states = new Map(tiers.flatMap((currentTier) => currentTier.nodes.map((definition): readonly [string, ProgressionNodeState] => {
    const apiNode = resolveProgressionNode(definition, detail.nodes);
    return [definition.key, {
      definition,
      apiNode,
      status: progressionNodeState(definition, apiNode, detail.selectedAbility, unlockedTier),
    }];
  })));

  return <ProgressionTreeGraph kind={kind} tiers={tiers} states={states} compact />;
};
