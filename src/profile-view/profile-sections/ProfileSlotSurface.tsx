import React from "react";
import { ChevronDown } from "lucide-react";
import "./profile-slot-surface.css";

export interface ProfileSlotGridProps<T> {
  ariaLabel: string;
  slots: readonly (T | null)[];
  columns: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemAriaLabel?: (item: T, index: number) => string;
  slotClassName?: (item: T | null, index: number) => string;
  gridClassName?: string;
  dataKey?: string;
}

export interface ProfileSlotSurfaceProps<T> extends ProfileSlotGridProps<T> {
  title: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  dataAttributes?: Readonly<Record<`data-${string}`, string | number | undefined>>;
  expanded?: boolean;
  onToggle?: () => void;
  bodyId?: string;
}

export const ProfileSlotGrid = <T,>({
  ariaLabel,
  slots,
  columns,
  renderItem,
  itemAriaLabel,
  slotClassName,
  gridClassName = "",
  dataKey,
}: ProfileSlotGridProps<T>): React.ReactElement => (
  <div
    className={`profile-slot-grid ${gridClassName}`.trim()}
    role="grid"
    aria-label={ariaLabel}
    data-profile-layout-grid="slots"
    style={{ "--profile-slot-columns": Math.max(1, Math.floor(columns)) } as React.CSSProperties}
  >
    {slots.map((item, index) => {
      const extraClass = slotClassName?.(item, index) ?? "";
      return item === null ? (
        <span
          className={`profile-slot profile-slot--empty ${extraClass}`.trim()}
          role="gridcell"
          aria-label="Empty slot"
          data-profile-slot={index}
          key={`${dataKey ?? ariaLabel}-slot-${index}`}
        />
      ) : (
        <span
          className={`profile-slot profile-slot--filled ${extraClass}`.trim()}
          role="gridcell"
          aria-label={itemAriaLabel?.(item, index)}
          data-profile-slot={index}
          key={`${dataKey ?? ariaLabel}-slot-${index}`}
        >
          {renderItem(item, index)}
        </span>
      );
    })}
  </div>
);

/** Exact slot geometry shared by Profile inventories, bags, and loadouts. */
export const ProfileSlotSurface = <T,>({
  title,
  meta = null,
  ariaLabel,
  slots,
  columns,
  renderItem,
  itemAriaLabel,
  slotClassName,
  className = "",
  gridClassName = "",
  dataKey,
  dataAttributes = {},
  expanded = true,
  onToggle,
  bodyId,
}: ProfileSlotSurfaceProps<T>): React.ReactElement => {
  const grid = (
    <ProfileSlotGrid
      ariaLabel={ariaLabel}
      slots={slots}
      columns={columns}
      renderItem={renderItem}
      itemAriaLabel={itemAriaLabel}
      slotClassName={slotClassName}
      gridClassName={gridClassName}
      dataKey={dataKey}
    />
  );
  return (
  <article className={`profile-slot-surface ${onToggle ? "is-collapsible" : ""} ${expanded ? "is-open" : ""} ${className}`.trim()} data-profile-slot-surface={dataKey} {...dataAttributes}>
    <header className="profile-slot-surface-head">
      {onToggle ? (
        <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
          <strong>{title}</strong>
          {meta !== null && <small>{meta}</small>}
          <ChevronDown aria-hidden />
        </button>
      ) : (
        <><strong>{title}</strong>{meta !== null && <small>{meta}</small>}</>
      )}
    </header>
    {onToggle ? <div className="profile-slot-surface-body" id={bodyId} hidden={!expanded}>{expanded && grid}</div> : grid}
  </article>
  );
};

export default ProfileSlotSurface;
