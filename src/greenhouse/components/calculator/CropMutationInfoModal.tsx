import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Box,
  ClockArrowDown,
  ClockArrowUp,
  Flame,
  Loader2,
  PackageOpen,
  Scissors,
  Sprout,
  Target,
  WandSparkles,
  X,
} from "lucide-react";
import { rarityKey } from "../../../search/rarity";
import { getEffectDescription, useInfoModal } from "../../context";
import type { CropDataJSON, EffectDefinition, MutationDataJSON } from "../../services/greenhouseDataService";
import { getGroundImagePath } from "../../types/greenhouse";
import { CropImage } from "../shared";
import { MutationRequirementGrid } from "../ui";

const formatName = (name: string): string =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const rarityStyle = (rarity: string | null | undefined): React.CSSProperties | undefined => {
  const key = rarityKey(rarity);
  return key
    ? ({ "--greenhouse-rarity": `var(--color-rarity-${key})` } as React.CSSProperties)
    : undefined;
};

const InfoFact: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: string;
}> = ({ icon, label, value, tone = "" }) => (
  <div className={`greenhouse-info-fact${tone ? ` is-${tone}` : ""}`}>
    {icon}
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const EffectList: React.FC<{
  title: string;
  icon: React.ReactNode;
  effects: string[];
  effectDescriptions: Record<string, EffectDefinition>;
  tone: "positive" | "negative";
}> = ({ title, icon, effects, effectDescriptions, tone }) => (
  <section className={`greenhouse-info-section greenhouse-info-effects is-${tone}`}>
    <header>{icon}<h3>{title}</h3></header>
    <div>
      {effects.map((effect) => {
        const description = getEffectDescription(effect, effectDescriptions);
        return (
          <article key={effect}>
            <strong>{formatName(effect)}</strong>
            {description && <p>{description}</p>}
          </article>
        );
      })}
    </div>
  </section>
);

export const CropMutationInfoModal: React.FC = () => {
  const modalRef = useRef<HTMLElement>(null);
  const {
    isOpen,
    isLoading,
    error,
    cropData,
    mutationData,
    effectsMap,
    allData,
    closeInfo,
  } = useInfoModal();

  const cropDataMap = useMemo(() => {
    if (!allData) return {};
    return {
      ...allData.crops,
      ...allData.mutations,
    } as Record<string, CropDataJSON | MutationDataJSON>;
  }, [allData]);

  useEffect(() => {
    if (!isOpen) return;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInfo();
    };

    document.addEventListener("keydown", handleEscape);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => modalRef.current?.focus());

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleEscape);
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [closeInfo, isOpen]);

  if (!isOpen) return null;

  const closeOnBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeInfo();
  };

  if (isLoading) {
    return createPortal(
      <div className="greenhouse-info-backdrop" onMouseDown={closeOnBackdrop}>
        <article ref={modalRef} className="greenhouse-info-modal is-status" role="dialog" aria-modal="true" aria-label="Loading plant details" tabIndex={-1}>
          <Loader2 className="greenhouse-info-spinner" aria-hidden="true" />
          <strong>Loading plant details</strong>
        </article>
      </div>,
      document.body,
    );
  }

  const isMutation = Boolean(mutationData);
  const data = mutationData ?? cropData;

  if (error || !data) {
    return createPortal(
      <div className="greenhouse-info-backdrop" onMouseDown={closeOnBackdrop}>
        <article ref={modalRef} className="greenhouse-info-modal is-status" role="dialog" aria-modal="true" aria-labelledby="greenhouse-info-error-title" tabIndex={-1}>
          <button type="button" className="greenhouse-info-close" onClick={closeInfo} aria-label="Close plant details"><X /></button>
          <AlertTriangle className="greenhouse-info-error-icon" aria-hidden="true" />
          <h2 id="greenhouse-info-error-title">Plant details unavailable</h2>
          <p>{error ?? "Item not found"}</p>
        </article>
      </div>,
      document.body,
    );
  }

  const id = isMutation ? mutationData!.id : cropData!.id;
  const name = data.name;
  const grounds = data.grounds?.length ? data.grounds : [data.ground];
  const rarity = mutationData?.rarity ?? null;
  const requirements = mutationData?.requirements ?? [];
  const drops = mutationData?.drops ?? null;
  const hasSideColumn = requirements.length > 0 || Boolean(drops && Object.keys(drops).length > 0);

  return createPortal(
    <div className="greenhouse-info-backdrop" onMouseDown={closeOnBackdrop}>
      <article
        ref={modalRef}
        className={`greenhouse-info-modal${hasSideColumn ? " has-side-column" : ""}`}
        style={rarityStyle(rarity)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="greenhouse-info-title"
        tabIndex={-1}
      >
        <header className="greenhouse-info-header">
          <span className="greenhouse-info-art">
            <CropImage cropId={id} cropName={name} width={48} height={48} showFallback={false} />
          </span>
          <div>
            <span>{isMutation ? "MUTATION" : "CROP"}</span>
            <h2 id="greenhouse-info-title">{name}</h2>
            <p>{data.size}×{data.size}{rarity ? ` · ${formatName(rarity)}` : ""}</p>
          </div>
          <button type="button" className="greenhouse-info-close" onClick={closeInfo} aria-label="Close plant details"><X /></button>
        </header>

        <div className="greenhouse-info-scroll">
          <div className="greenhouse-info-facts">
            <InfoFact
              icon={<Box aria-hidden="true" />}
              label="GROUND"
              value={(
                <span className="greenhouse-info-ground">
                  <i style={{ backgroundImage: `url(${getGroundImagePath(grounds[0])})` }} />
                  {grounds.map(formatName).join(" or ")}
                </span>
              )}
              tone="ground"
            />
            {data.growth_stages !== null && (
              <InfoFact icon={<ClockArrowUp aria-hidden="true" />} label="GROWTH" value={`${data.growth_stages} stage${data.growth_stages === 1 ? "" : "s"}`} tone="growth" />
            )}
            {mutationData && mutationData.decay > 0 && (
              <InfoFact icon={<ClockArrowDown aria-hidden="true" />} label="DECAY" value={`${mutationData.decay} day${mutationData.decay === 1 ? "" : "s"}`} tone="decay" />
            )}
          </div>

          <div className={`greenhouse-info-body${hasSideColumn ? " has-side-column" : ""}`}>
            <main className="greenhouse-info-main">
              {mutationData?.special && (
                <section className="greenhouse-info-section is-special">
                  <header><WandSparkles aria-hidden="true" /><h3>Special condition</h3></header>
                  <p>{formatName(mutationData.special)}</p>
                </section>
              )}
              {mutationData?.growing_info && (
                <section className="greenhouse-info-section is-growing">
                  <header><Sprout aria-hidden="true" /><h3>Growing</h3></header>
                  <p>{mutationData.growing_info}</p>
                </section>
              )}
              {mutationData?.harvest_info && (
                <section className="greenhouse-info-section is-harvest">
                  <header><Scissors aria-hidden="true" /><h3>Harvest</h3></header>
                  <p>{mutationData.harvest_info}</p>
                </section>
              )}

              {(data.positive_buffs.length > 0 || data.negative_buffs.length > 0) && (
                <div className="greenhouse-info-effect-grid">
                  {data.positive_buffs.length > 0 && (
                    <EffectList title="Positive effects" icon={<Flame aria-hidden="true" />} effects={data.positive_buffs} effectDescriptions={effectsMap} tone="positive" />
                  )}
                  {data.negative_buffs.length > 0 && (
                    <EffectList title="Negative effects" icon={<AlertTriangle aria-hidden="true" />} effects={data.negative_buffs} effectDescriptions={effectsMap} tone="negative" />
                  )}
                </div>
              )}
            </main>

            {hasSideColumn && (
              <aside className="greenhouse-info-side">
                {requirements.length > 0 && (
                  <section className="greenhouse-info-section is-requirements">
                    <header><Target aria-hidden="true" /><h3>Requirements</h3></header>
                    <div className="greenhouse-info-requirement-grid">
                      <MutationRequirementGrid mutationId={id} cropDataMap={cropDataMap} />
                    </div>
                    <div className="greenhouse-info-item-list">
                      {requirements.map((requirement) => {
                        const requiredData = cropDataMap[requirement.crop];
                        const requiredRarity = requiredData && "rarity" in requiredData ? requiredData.rarity : null;
                        const requiredName = requiredData?.name ?? formatName(requirement.crop);
                        return (
                          <div key={requirement.crop} style={rarityStyle(requiredRarity)}>
                            <CropImage cropId={requirement.crop} cropName={requiredName} width={27} height={27} showFallback={false} />
                            <span><strong>{requiredName}</strong><small>{requirement.count.toLocaleString()} required</small></span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {drops && Object.keys(drops).length > 0 && (
                  <section className="greenhouse-info-section is-drops">
                    <header><PackageOpen aria-hidden="true" /><h3>Drops</h3></header>
                    <div className="greenhouse-info-item-list">
                      {Object.entries(drops).map(([dropId, amount]) => {
                        const dropData = cropDataMap[dropId];
                        const dropRarity = dropData && "rarity" in dropData ? dropData.rarity : null;
                        const dropName = dropData?.name ?? formatName(dropId);
                        return (
                          <div key={dropId} style={rarityStyle(dropRarity)}>
                            <CropImage cropId={dropId} cropName={dropName} width={27} height={27} showFallback={false} />
                            <span><strong>{dropName}</strong><small>{amount.toLocaleString()} per harvest</small></span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </aside>
            )}
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
};
