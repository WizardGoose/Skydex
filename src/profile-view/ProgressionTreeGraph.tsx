import React, { useMemo } from "react";
import { ItemIcon } from "../ui/ItemIcon";
import { ItemTooltip } from "../ui/ItemTooltip";
import {
  progressionStateIcon,
  type ProgressionKind,
  type ProgressionNodeState,
  type ProgressionTierDefinition,
} from "./progressionGuiModel";

interface ProgressionTreeGraphProps {
  kind: ProgressionKind;
  tiers: readonly ProgressionTierDefinition[];
  states: ReadonlyMap<string, ProgressionNodeState>;
  compact?: boolean;
}

interface GraphPoint {
  x: number;
  y: number;
}

interface GraphConnection {
  key: string;
  from: GraphPoint;
  to: GraphPoint;
  tone: "allocated" | "available" | "locked";
}

const nodePoint = (column: number, row: number, rowCount: number): GraphPoint => ({
  x: ((column - 0.5) / 7) * 100,
  y: ((row + 0.5) / rowCount) * 100,
});

const connectionTone = (
  fromState: ProgressionNodeState | undefined,
  toState: ProgressionNodeState | undefined,
): "allocated" | "available" | "locked" => {
  if (!fromState || !toState || fromState.status === "locked" || toState.status === "locked") return "locked";
  if (fromState.apiNode && toState.apiNode) return "allocated";
  return "available";
};

export const ProgressionTreeGraph: React.FC<ProgressionTreeGraphProps> = ({
  kind,
  tiers,
  states,
  compact = false,
}) => {
  const descending = useMemo(() => [...tiers].sort((a, b) => b.tier - a.tier), [tiers]);
  const unlockedTier = useMemo(() => descending.reduce((highest, currentTier) => (
    currentTier.nodes.some((definition) => states.get(definition.key)?.status !== "locked")
      ? Math.max(highest, currentTier.tier)
      : highest
  ), 1), [descending, states]);
  const positions = useMemo(() => new Map(descending.flatMap((currentTier, row) => (
    currentTier.nodes.map((definition): readonly [string, GraphPoint] => [
      definition.key,
      nodePoint(definition.column, row, descending.length),
    ])
  ))), [descending]);
  const connections = useMemo(() => {
    const result: GraphConnection[] = [];
    descending.forEach((currentTier, row) => {
      const nodes = [...currentTier.nodes].sort((a, b) => a.column - b.column);
      if (nodes.length >= 5) {
        nodes.slice(1).forEach((definition, index) => {
          const previous = nodes[index];
          const from = positions.get(previous.key);
          const to = positions.get(definition.key);
          if (!from || !to) return;
          result.push({
            key: `tier-${currentTier.tier}-${previous.key}-${definition.key}`,
            from,
            to,
            tone: connectionTone(states.get(previous.key), states.get(definition.key)),
          });
        });
      }

      const nextTier = descending[row + 1];
      if (!nextTier) return;
      const nextByColumn = new Map(nextTier.nodes.map((definition) => [definition.column, definition]));
      nodes.forEach((definition) => {
        const next = nextByColumn.get(definition.column);
        if (!next) return;
        const from = positions.get(definition.key);
        const to = positions.get(next.key);
        if (!from || !to) return;
        result.push({
          key: `spine-${definition.key}-${next.key}`,
          from,
          to,
          tone: connectionTone(states.get(definition.key), states.get(next.key)),
        });
      });
    });
    return result;
  }, [descending, positions, states]);
  const graphStyle = { "--profile-tree-tier-count": descending.length } as React.CSSProperties;

  return (
    <div
      className={`profile-tree-graph profile-tree-graph--${kind}${compact ? " profile-tree-graph--compact" : ""}`}
      role="tree"
      aria-label={`${kind === "hotm" ? "Heart of the Mountain" : "Heart of the Forest"} skill tree`}
      style={graphStyle}
    >
      <div className="profile-tree-graph-labels" aria-hidden>
        {descending.map((currentTier, row) => {
          const tierTone = currentTier.tier > unlockedTier ? "locked" : currentTier.tier === unlockedTier ? "current" : "unlocked";
          return (
            <span
              className={`profile-tree-graph-tier profile-tree-graph-tier--${tierTone}`}
              style={{ top: `${((row + 0.5) / descending.length) * 100}%` }}
              key={currentTier.tier}
            >
              {!compact && <small>Tier</small>}
              <b className="profile-number">{currentTier.tier}</b>
            </span>
          );
        })}
      </div>

      <div className="profile-tree-graph-canvas" role="group">
        <svg className="profile-tree-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {connections.map((connection) => (
            <line
              className={`profile-tree-connection profile-tree-connection--${connection.tone}`}
              x1={connection.from.x}
              y1={connection.from.y}
              x2={connection.to.x}
              y2={connection.to.y}
              vectorEffect="non-scaling-stroke"
              key={connection.key}
            />
          ))}
        </svg>

        {descending.flatMap((currentTier, row) => currentTier.nodes.flatMap((definition) => {
          const state = states.get(definition.key);
          if (!state) return [];
          const icon = progressionStateIcon(state, kind);
          const iconClass = icon.id === "PALE_OAK_BUTTON" ? "profile-tree-forest-perk" : undefined;
          const point = nodePoint(definition.column, row, descending.length);
          const content = (
            <>
              <span className="profile-tree-graph-node-icon" aria-hidden>
                <ItemIcon name={icon.name} id={icon.id} size={compact ? 18 : 30} fallback="blank" className={iconClass} />
              </span>
              {state.apiNode && (
                <span className="profile-tree-graph-node-level profile-number">{state.apiNode.level}</span>
              )}
            </>
          );
          const tooltipIcon = <ItemIcon name={icon.name} id={icon.id} size={38} fallback="blank" className={iconClass} />;
          const className = `profile-tree-graph-node profile-tree-graph-node--${state.status}`;
          const label = `${definition.name}, ${state.status}${state.apiNode ? `, level ${state.apiNode.level}` : ""}`;
          const style = { left: `${point.x}%`, top: `${point.y}%` };
          const trigger = state.status !== "locked" ? (
            <button type="button" className={className} role="treeitem" aria-label={label} aria-level={currentTier.tier}>
              {content}
            </button>
          ) : (
            <span className={className} role="treeitem" aria-label={label} aria-level={currentTier.tier} aria-disabled tabIndex={0}>
              {content}
            </span>
          );
          return [(
            <div className="profile-tree-graph-node-anchor" style={style} key={definition.key}>
              <ItemTooltip
                name={definition.name}
                wikiName={definition.wikiName}
                identityColor={kind === "hotf" ? "#77ed98" : "#55d8ff"}
                icon={tooltipIcon}
                skyDexSections={[{
                  title: "Power stats",
                  tone: "bonus",
                  lines: [(
                    <span className="profile-tree-power-stat" key="power">
                      <span>{state.apiNode ? `Rank ${state.apiNode.level}` : "Perk effect"}</span>
                      <strong>{definition.summary}</strong>
                    </span>
                  )],
                }]}
                ariaLabel={label}
                wrapperClassName="profile-tree-graph-node-tooltip"
              >
                {trigger}
              </ItemTooltip>
            </div>
          )];
        }))}
      </div>
    </div>
  );
};

export default ProgressionTreeGraph;
