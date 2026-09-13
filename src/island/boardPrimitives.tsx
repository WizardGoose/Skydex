import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { COLUMN_STEPS, columnsFor, distribute } from "./columns";
import { NUM } from "../ui/kit";

/** Fixed-column board mechanics shared by Profile Inventory and comparable tools. */
export const CardBoard = <T,>({
  items,
  keyOf,
  render,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
}) => {
  const [columnCount, setColumnCount] = useState(() =>
    typeof window === "undefined" ? 1 : columnsFor(window.innerWidth)
  );

  useEffect(() => {
    const read = () => setColumnCount(columnsFor(window.innerWidth));
    read();
    const queries = COLUMN_STEPS.map((step) => window.matchMedia(`(min-width: ${step.minWidth}px)`));
    for (const query of queries) query.addEventListener("change", read);
    window.addEventListener("resize", read);
    return () => {
      for (const query of queries) query.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  const columns = useMemo(() => distribute(items, columnCount), [items, columnCount]);
  return (
    <div className="flex items-start gap-2 p-2" data-fixed-card-board>
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-2" data-fixed-card-column>
          {column.map((item) => (
            <React.Fragment key={keyOf(item)}>{render(item)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
};

/** Shared Sacks-style expandable card shell. */
export const CollapseCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  open: boolean;
  hit: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ icon, title, meta, right, open, hit, onToggle, children }) => (
  <div
    className={`rounded-md border ${
      hit ? "border-cyan-500/40 bg-cyan-500/5" : "border-white/8 bg-white/5"
    }`}
  >
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/90"
    >
      <ChevronDown
        className={`h-3 w-3 shrink-0 text-slate-500 transition-transform duration-200 ease-out motion-reduce:transition-none ${
          open ? "" : "-rotate-90"
        }`}
        aria-hidden
      />
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-slate-200">{title}</span>
        {meta !== undefined && <span className={`block truncate text-[10px] ${NUM} text-slate-500`}>{meta}</span>}
      </span>
      {right}
    </button>
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className={`min-h-0 ${open ? "" : "overflow-hidden"}`}>{children}</div>
    </div>
  </div>
);

export const BoardControl: React.FC<{
  anyOpen: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}> = ({ anyOpen, onCollapseAll, onExpandAll }) => (
  <button
    type="button"
    onClick={anyOpen ? onCollapseAll : onExpandAll}
    className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/90"
  >
    {anyOpen ? "Collapse all" : "Expand all"}
  </button>
);
