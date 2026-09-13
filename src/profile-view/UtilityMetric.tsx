import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Info } from "lucide-react";
import { ProfileInfoPopover } from "./ProfileInfoPopover";
import "./utility-metric.css";

type MetricInfo = ComponentProps<typeof ProfileInfoPopover>["info"];

export function UtilityInfo({ title, info, children, control = false, className = "", ariaLabel, activation, details }: {
  title: string; info: MetricInfo; children: ReactElement; control?: boolean; className?: string; ariaLabel?: string; activation?: "hover" | "click";
  details?: ReactNode;
}) {
  return <ProfileInfoPopover title={title} info={info} ariaLabel={ariaLabel ?? `${title} information`}
    triggerMode={control ? "control" : "information"} activation={activation} details={details} wrapperClassName={`utility-info ${className}`}>
    {children}
  </ProfileInfoPopover>;
}

export function UtilityMetric({ label, value, tone, info, detail, activation }: {
  label: string; value: ReactNode; tone: "progress" | "storage" | "materials" | "time" | "operations" | "growth" | "plots";
  info?: MetricInfo; detail?: ReactNode; activation?: "hover" | "click";
}) {
  return <div className={`profile-metric utility-metric utility-metric--${tone}`}>
    <dt className="profile-metric-head">
      <span className="profile-metric-label">{label}</span>
      {info && <UtilityInfo title={label} info={info} activation={activation}>
        <button type="button" className="profile-metric-hint-button"><Info aria-hidden /></button>
      </UtilityInfo>}
    </dt>
    <dd className="profile-number">{value}</dd>
    {detail && <dd className="utility-metric-detail">{detail}</dd>}
  </div>;
}
