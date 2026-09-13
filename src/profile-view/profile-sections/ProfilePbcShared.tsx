import React from "react";
import { AlertCircle, ChevronDown, Grid3X3, KeyRound } from "lucide-react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import { usePersistentDisclosure } from "../disclosure";

export const ProfilePbcHeader: React.FC<{
  eyebrow: string;
  title: string;
  count: number | null;
  countLabel: string;
}> = ({ eyebrow, title, count, countLabel }) => (
  <header className="profile-panel-head profile-pbc-head">
    <div className="profile-loadout-title-copy">
      <span className="profile-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
    </div>
    {count !== null && (
      <span className="profile-pbc-count">
        <Grid3X3 aria-hidden />
        <strong className="profile-number">{count.toLocaleString()}</strong>
        <span>{countLabel}</span>
      </span>
    )}
  </header>
);

export const ProfilePbcStatusLine: React.FC<{
  status: ProfileStatusView;
  partial?: boolean;
}> = ({ status, partial = false }) => {
  if (!status.label && !partial) return null;
  return (
    <div className="profile-pbc-status" role="status">
      {status.showNoKey ? <KeyRound aria-hidden /> : <AlertCircle aria-hidden />}
      <span>{status.label ?? "Some progression details are unavailable."}</span>
    </div>
  );
};

export const ProfilePbcUnavailable: React.FC<{
  status: ProfileStatusView;
  noun: string;
  error?: string | null;
}> = ({ status, noun, error }) => {
  const copy = status.showNoKey
    ? status.label
    : status.showError
      ? error || status.label
      : `${noun} data is unavailable for this profile.`;
  return (
    <div className="profile-pbc-message" role={status.showError ? "alert" : "status"}>
      {status.showNoKey ? <KeyRound aria-hidden /> : <AlertCircle aria-hidden />}
      <span>{copy}</span>
    </div>
  );
};

export const ProfilePbcEmpty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="profile-pbc-message" role="status">
    <span>{children}</span>
  </div>
);

export const ProfilePbcLoading: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div className="profile-pbc-loading" aria-label="Loading profile data" role="status">
    {Array.from({ length: rows }, (_, index) => (
      <span key={index} aria-hidden>
        <i />
        <b />
      </span>
    ))}
  </div>
);

export const ProfilePbcDisclosure: React.FC<{
  storageId: string;
  title: string;
  count: number | null;
  initiallyExpanded?: boolean;
  controls?: React.ReactNode;
  children: React.ReactNode;
}> = ({ storageId, title, count, initiallyExpanded = true, controls = null, children }) => {
  const [expanded, setExpanded] = usePersistentDisclosure(`profile-pbc:${storageId}`, initiallyExpanded);
  const labelId = React.useId();
  const bodyId = React.useId();
  const heading = (
    <span className="profile-wardrobe-page-legend" id={labelId}>
      <span>{title}</span>
      {count !== null && (
        <span className="profile-wardrobe-page-saved">
          <Grid3X3 aria-hidden />
          {count.toLocaleString()}
        </span>
      )}
    </span>
  );

  return (
    <section className={`profile-wardrobe-page profile-pbc-page ${expanded ? "is-open" : ""}`} aria-labelledby={labelId}>
      {controls ? (
        <div className="profile-wardrobe-page-titlebar profile-pbc-page-titlebar-with-controls">
          <button
            type="button"
            className="profile-pbc-page-titlebutton profile-wardrobe-page-disclosure"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((current) => !current)}
          >
            {heading}
          </button>
          {expanded && <div className="profile-pbc-page-controls">{controls}</div>}
          <button
            type="button"
            className="profile-pbc-page-chevronbutton profile-wardrobe-page-disclosure"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((current) => !current)}
          >
            <ChevronDown className="profile-disclosure-chevron" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="profile-wardrobe-page-titlebar profile-wardrobe-page-disclosure"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((current) => !current)}
        >
          {heading}
          <ChevronDown className="profile-disclosure-chevron" aria-hidden />
        </button>
      )}
      <div className="profile-wardrobe-page-body profile-pbc-page-body" id={bodyId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </section>
  );
};
