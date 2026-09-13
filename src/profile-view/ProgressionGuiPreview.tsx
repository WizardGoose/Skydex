import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ProfileLoadoutContextView } from "../profile/profileViewModel";
import { ItemIcon } from "../ui/ItemIcon";
import { WikiLink } from "../ui/WikiLink";
import { ProgressionTreeGraph } from "./ProgressionTreeGraph";
import {
  progressionNodeState,
  progressionTiers,
  progressionUnlockedTier,
  resolveProgressionNode,
  unplacedProgressionNodes,
  type ProgressionKind,
  type ProgressionNodeState,
} from "./progressionGuiModel";

interface ProgressionGuiPreviewProps {
  context: ProfileLoadoutContextView;
  onClose: () => void;
}

export const ProgressionGuiPreview: React.FC<ProgressionGuiPreviewProps> = ({ context, onClose }) => {
  const detail = context.detail;
  const kind: ProgressionKind = context.tone === "hotf" ? "hotf" : "hotm";
  const tiers = progressionTiers(kind);
  const treeDetail = detail?.kind === "tree" ? detail : null;
  const unlockedTier = progressionUnlockedTier(kind, treeDetail?.experience ?? null, tiers, treeDetail?.nodes ?? []);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const states = useMemo(() => {
    const entries = tiers.flatMap((currentTier) => currentTier.nodes.map((definition): readonly [string, ProgressionNodeState] => {
      const apiNode = resolveProgressionNode(definition, treeDetail?.nodes ?? []);
      return [definition.key, {
        definition,
        apiNode,
        status: progressionNodeState(definition, apiNode, treeDetail?.selectedAbility ?? null, unlockedTier),
      }];
    }));
    return new Map(entries);
  }, [tiers, treeDetail?.nodes, treeDetail?.selectedAbility, unlockedTier]);

  const unknownNodes = unplacedProgressionNodes(tiers, treeDetail?.nodes ?? []);

  if (!treeDetail || typeof document === "undefined") return null;

  const dialogId = `profile-context-${context.label.toLowerCase()}`;

  return createPortal(
    <div className="profile-tree-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        id={dialogId}
        className={`profile-tree-preview profile-tree-preview--${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
      >
        <header className="profile-tree-preview-head">
          <WikiLink name={treeDetail.wikiName} className="profile-tree-preview-icon-link" showExternalIcon={false}>
            <>
              <span className="profile-tree-preview-icon" aria-hidden>
                <ItemIcon name={context.iconName} id={context.iconId} size={38} fallback="initials" />
              </span>
              <span className="sr-only">Open {treeDetail.name} on the wiki</span>
            </>
          </WikiLink>
          <span>
            <WikiLink name={treeDetail.wikiName} className="profile-tree-preview-title">
              <strong id={`${dialogId}-title`}>{context.value ?? treeDetail.name}</strong>
            </WikiLink>
          </span>
          <button type="button" className="profile-tree-preview-close" aria-label={`Close ${treeDetail.name} preview`} onClick={onClose} autoFocus>
            <X aria-hidden />
          </button>
        </header>

        <div className="profile-tree-preview-body">
          <div className="profile-tree-stage">
            <div className="profile-tree-game-window">
              <div className="profile-tree-board-scroll">
                <ProgressionTreeGraph
                  kind={kind}
                  tiers={tiers}
                  states={states}
                />
              </div>
            </div>
          </div>

        </div>

        {unknownNodes.length > 0 && (
          <div className="profile-tree-unplaced">
            <span><small>New API nodes</small><strong>{unknownNodes.length}</strong></span>
            <div>
              {unknownNodes.map((apiNode) => (
                <span key={apiNode.key}>
                  {apiNode.name} <span className="profile-number">{apiNode.level}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
};
