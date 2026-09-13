import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import type { SavedLayout } from "../../types/layout";
import { getGroundImagePath } from "../../types/greenhouse";
import { useGreenhouseData } from "../../context";
import { CropImage } from "../shared";
import { WikiLink } from "../../../ui/WikiLink";
import { wikiArticleUrl } from "../../../ui/wikiUrl";
import {
  buildLayoutPreviewModel,
  buildLayoutPreviewStatus,
  type LayoutPreviewCount,
  type LayoutPreviewTargetStatus,
} from "./layoutPreviewModel";
import { previewGridCells } from "./layoutPreviewPresentation";

export type DesignerLayoutSnapshot = Pick<SavedLayout, "inputs" | "targets">;

const SummaryItems: React.FC<{ items: LayoutPreviewCount[] }> = ({ items }) => (
  <div className="flex min-w-0 flex-wrap gap-1.5">
    {items.map((item) => (
      <WikiLink
        key={item.cropId}
        name={item.name}
        title={`${item.name} on the wiki`}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-2 py-1 text-[12px] text-slate-300"
        nameClassName="inline-flex min-w-0 items-center gap-1.5"
      >
        <CropImage cropId={item.cropId} cropName={item.name} size="xs" showFallback />
        <span className="max-w-36 truncate">{item.name}</span>
        <span className="font-mono tabular-nums text-slate-400">x{item.count}</span>
      </WikiLink>
    ))}
  </div>
);

const RequirementList: React.FC<{
  title: string;
  tone: "missing" | "satisfied";
  requirements: LayoutPreviewTargetStatus["validation"]["missingRequirements"];
  cropName: (id: string) => string;
}> = ({ title, tone, requirements, cropName }) => {
  if (requirements.length === 0) return null;
  return (
    <div>
      <p className={`mb-1 text-[11px] font-semibold ${tone === "missing" ? "text-red-300" : "text-emerald-300"}`}>
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {requirements.map((requirement) => {
          const name = cropName(requirement.crop);
          return (
            <span
              key={requirement.crop}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[12px] text-slate-300"
            >
              <CropImage cropId={requirement.crop} cropName={name} size="xs" showFallback />
              <span>{name}</span>
              <span className={`font-mono tabular-nums ${tone === "missing" ? "text-red-300" : "text-emerald-300"}`}>
                {requirement.have}/{requirement.needed}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const DesignerLayoutPreview: React.FC<{
  layout: DesignerLayoutSnapshot;
  className?: string;
  compact?: boolean;
}> = ({ layout, className = "", compact = false }) => {
  const { mutations, getCropDef, getMutationDef } = useGreenhouseData();
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const model = useMemo(
    () =>
      buildLayoutPreviewModel(
        {
          id: "preview",
          name: "Preview",
          savedAt: 0,
          modifiedAt: 0,
          inputs: layout.inputs,
          targets: layout.targets,
        },
        getCropDef,
        getMutationDef,
      ),
    [getCropDef, getMutationDef, layout.inputs, layout.targets],
  );
  const status = useMemo(() => buildLayoutPreviewStatus(model, mutations), [model, mutations]);
  const statusById = useMemo(
    () => new Map(status.targets.map((target) => [target.id, target])),
    [status.targets],
  );
  const hoveredTarget = hoveredTargetId ? statusById.get(hoveredTargetId) ?? null : null;
  const cropName = (id: string) => getCropDef(id)?.name ?? getMutationDef(id)?.name ?? id;

  return (
    <div className={`${compact ? "greenhouse-loadout-preview grid items-start gap-4" : "grid gap-5 md:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] md:items-start"} ${className}`}>
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-md border border-white/12 bg-black/30 p-1 shadow-inner${compact ? " greenhouse-loadout-preview-grid" : ""}`}
        role="img"
        aria-label={`10 by 10 layout preview with ${layout.inputs.length} input crops and ${layout.targets.length} target mutations`}
      >
        <div className="grid h-full w-full grid-cols-10 grid-rows-10 gap-[2px]">
          {previewGridCells().map((cell) => (
            <span
              key={cell.index}
              aria-hidden
              className="rounded-[2px] border border-white/8 bg-slate-800/75"
              style={{ gridColumnStart: cell.gridColumnStart, gridRowStart: cell.gridRowStart }}
            />
          ))}
          {model.placements.map((placement) => {
            const [row, col] = placement.position;
            const targetStatus = placement.isTarget ? statusById.get(placement.id) : undefined;
            const targetState = targetStatus?.validation.state;
            return (
              <a
                key={placement.id}
                href={wikiArticleUrl(placement.name)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${placement.name} on the wiki`}
                data-preview-target-state={targetState}
                onMouseEnter={placement.isTarget ? () => setHoveredTargetId(placement.id) : undefined}
                onMouseLeave={placement.isTarget ? () => setHoveredTargetId(null) : undefined}
                onFocus={placement.isTarget ? () => setHoveredTargetId(placement.id) : undefined}
                onBlur={placement.isTarget ? () => setHoveredTargetId(null) : undefined}
                className={`group/preview-cell relative z-10 grid cursor-pointer place-items-center overflow-hidden rounded-[3px] border transition-[filter,transform,box-shadow] hover:z-20 hover:scale-110 hover:brightness-125 focus-visible:z-20 focus-visible:scale-110 ${
                  targetState === "valid"
                    ? "border-cyan-400 shadow-[0_0_10px_color-mix(in_srgb,var(--color-cyan-400)_60%,transparent)]"
                    : targetState === "delayed"
                      ? "border-yellow-300 shadow-[0_0_12px_color-mix(in_srgb,var(--color-yellow-400)_75%,transparent)]"
                      : targetState === "invalid"
                        ? "border-red-500 shadow-[0_0_8px_color-mix(in_srgb,var(--color-red-500)_45%,transparent)]"
                        : "border-white/18"
                }`}
                style={{
                  gridColumn: `${col + 1} / span ${placement.size}`,
                  gridRow: `${row + 1} / span ${placement.size}`,
                  backgroundImage: placement.ground ? `url(${getGroundImagePath(placement.ground)})` : undefined,
                  backgroundSize: `calc(100% / ${placement.size}) calc(100% / ${placement.size})`,
                  backgroundRepeat: "repeat",
                }}
                title={`${placement.name}${placement.isTarget ? " target" : ""} on the wiki`}
              >
                <CropImage
                  cropId={placement.cropId}
                  cropName={placement.name}
                  size="full"
                  hasGroundContext={Boolean(placement.ground)}
                  groundType={placement.ground ?? "farmland"}
                  className="p-[4%]"
                  showFallback
                />
              </a>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 divide-y divide-white/10 border-y border-white/10">
        <div className="grid gap-2 py-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Makes</span>
          {model.targets.length > 0 ? <SummaryItems items={model.targets} /> : <span className="text-[12px] text-slate-500">No targets</span>}
        </div>
        <div className="grid gap-2 py-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Plant</span>
          {model.plants.length > 0 ? <SummaryItems items={model.plants} /> : <span className="text-[12px] text-slate-500">No input crops</span>}
        </div>
        <div className="grid gap-2 py-2.5 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ground</span>
          <div className="flex flex-wrap gap-1.5">
            {model.grounds.length > 0 ? (
              model.grounds.map((ground) => (
                <span
                  key={ground.key}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/6 px-2 py-1 text-[12px] text-slate-300"
                >
                  <span
                    aria-hidden
                    className="h-5 w-5 rounded-[3px] border border-white/15 bg-cover bg-center"
                    style={{ backgroundImage: `url(${getGroundImagePath(ground.key.split("|")[0])})` }}
                  />
                  <span>{ground.label}</span>
                  <span className="font-mono tabular-nums text-slate-400">x{ground.count}</span>
                </span>
              ))
            ) : (
              <span className="text-[12px] text-slate-500">No occupied ground</span>
            )}
          </div>
        </div>
        <div className={`grid gap-3 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]${compact ? " min-h-0" : " min-h-36"}`} aria-live="polite">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mutation status</span>
          {hoveredTarget ? (
            <div data-preview-status-target={hoveredTarget.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CropImage cropId={hoveredTarget.cropId} cropName={hoveredTarget.name} size="sm" showFallback />
                <span className="text-sm font-semibold text-slate-100">{hoveredTarget.name}</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  hoveredTarget.validation.state === "valid"
                    ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-200"
                    : hoveredTarget.validation.state === "delayed"
                      ? "border-yellow-400/35 bg-yellow-400/10 text-yellow-200"
                      : "border-red-500/35 bg-red-500/10 text-red-200"
                }`}>
                  {hoveredTarget.validation.state === "valid" ? <CheckCircle2 className="h-3.5 w-3.5" /> : hoveredTarget.validation.state === "delayed" ? <Clock3 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {hoveredTarget.validation.state}
                </span>
              </div>
              {hoveredTarget.validation.state === "delayed" && (
                <p className="text-[12px] text-yellow-200/85">Needs another target mutation to grow first.</p>
              )}
              <RequirementList
                title="Missing"
                tone="missing"
                requirements={hoveredTarget.validation.missingRequirements}
                cropName={cropName}
              />
              <RequirementList
                title="Satisfied"
                tone="satisfied"
                requirements={hoveredTarget.validation.satisfiedRequirements}
                cropName={cropName}
              />
            </div>
          ) : (
            <div className="flex flex-wrap content-start gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/8 px-2.5 py-1.5 text-[12px] text-cyan-200">
                <CheckCircle2 className="h-4 w-4" /> {status.counts.valid} ready
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400/25 bg-yellow-400/8 px-2.5 py-1.5 text-[12px] text-yellow-200">
                <Clock3 className="h-4 w-4" /> {status.counts.delayed} delayed
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/25 bg-red-500/8 px-2.5 py-1.5 text-[12px] text-red-200">
                <AlertCircle className="h-4 w-4" /> {status.counts.invalid} blocked
              </span>
              <p className="basis-full text-[12px] text-slate-500">Hover or focus a target in the field to inspect its requirements.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
