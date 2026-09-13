import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { FOCUS, NUM, PANEL } from "../ui/kit";

export const ForgeGroup: React.FC<{
  title: string;
  count: number;
  initiallyOpen: boolean;
  children: React.ReactNode;
}> = ({ title, count, initiallyOpen, children }) => {
  const [open, setOpen] = useState(initiallyOpen);

  useEffect(() => {
    if (initiallyOpen) setOpen(true);
  }, [initiallyOpen]);

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={`${PANEL} overflow-hidden`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-200">{title}</span>
        <span className={`text-[11px] ${NUM} text-slate-500`}>{count} recipes</span>
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
        />
      </summary>
      {open && children}
    </details>
  );
};
