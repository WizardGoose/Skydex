import React from "react";
import { SplitPage } from "../ui/kit";

interface GreenhouseCapabilityFrameProps {
  embedded?: boolean;
  variant?: "split" | "planner" | "band";
  rail: React.ReactNode;
  railLabel: string;
  leading?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Keeps the legacy route contract available for direct consumers while giving
 * the unified Greenhouse route a page-owned presentation boundary. The
 * embedded frame deliberately has no full-height rail or independent app
 * chrome: controls and results are two lanes of one capability in the same
 * workbench flow.
 */
export const GreenhouseCapabilityFrame: React.FC<GreenhouseCapabilityFrameProps> = ({
  embedded = false,
  variant = "split",
  rail,
  railLabel,
  leading,
  children,
}) => {
  if (!embedded) {
    return (
      <SplitPage railLabel={railLabel} rail={rail}>
        {leading}
        {children}
      </SplitPage>
    );
  }

  return (
    <div className={`greenhouse-capability-frame greenhouse-capability-frame--${variant}`}>
      {leading && <div className="greenhouse-capability-leading">{leading}</div>}
      <aside className="greenhouse-capability-setup" aria-label={railLabel}>
        {rail}
      </aside>
      <div className="greenhouse-capability-results">{children}</div>
    </div>
  );
};
