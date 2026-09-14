import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AlertTriangle, Clipboard, Home, RotateCw, Settings, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { FOCUS, LABEL } from "../../ui/kit";
import { copyFailureDetails, formatFailureDetails, logUnexpectedFailure, type FailureModel } from "./failureModel";
import "./failure-surface.css";

const VectorMark = lazy(() => import("../../mark").then((module) => ({ default: module.VectorMark })));

export const FailureSurface: React.FC<{
  failure: FailureModel;
  onRetry?: () => void;
}> = ({ failure, onRetry }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
    logUnexpectedFailure(failure);
  }, [failure]);

  const copy = async () => {
    const didCopy = await copyFailureDetails(failure);
    setCopied(didCopy);
    if (didCopy) window.setTimeout(() => setCopied(false), 2200);
  };

  const showRetry = onRetry && failure.retryMode !== "none";
  const showSettings = failure.credentialsLikely;
  const onProfile = failure.details.route === "/profile";
  const showProfile = !onProfile;
  const showHome = failure.kind === "not-found" || !showRetry || onProfile;

  return (
    <section
      data-error-surface={failure.kind}
      role="alert"
      className="failure-surface"
    >
      <div className="failure-surface-main">
        <div className="failure-surface-companion" aria-label="Wonder, the Skydex companion">
          <Suspense fallback={null}>
            <VectorMark alert thinking={false} force="alert" className="failure-surface-wonder" />
          </Suspense>
          <span className="failure-surface-icon" aria-hidden>
            <AlertTriangle />
          </span>
        </div>
        <div className="failure-surface-copy">
          <p className={LABEL}>Skydex recovery</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {failure.title}
          </h1>
          <p>{failure.description}</p>
        </div>

        <div className="failure-surface-actions">
          {showRetry && (
            <button type="button" onClick={onRetry} className={`failure-surface-action is-primary ${FOCUS}`}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </button>
          )}
          {showProfile && (
            <Link to="/profile?tab=gear" className={`failure-surface-action ${FOCUS}`}>
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              Go to Profile
            </Link>
          )}
          {showSettings && (
            <Link to="/?settings=1" className={`failure-surface-action ${FOCUS}`}>
              <Settings className="h-3.5 w-3.5" aria-hidden />
              Open Settings
            </Link>
          )}
          {showHome && (
            <Link to="/" className={`failure-surface-action ${FOCUS}`}>
              <Home className="h-3.5 w-3.5" aria-hidden />
              Go to dashboard
            </Link>
          )}
        </div>
      </div>

      <details className="failure-surface-details">
        <summary className={FOCUS + " [&::-webkit-details-marker]:hidden"}>Technical details</summary>
        <div className="failure-surface-details-body">
          <pre>{formatFailureDetails(failure)}</pre>
          <button type="button" onClick={() => void copy()} className={`failure-surface-action ${FOCUS}`} aria-label="Copy sanitized technical details">
            <Clipboard className="h-3.5 w-3.5" aria-hidden />
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      </details>
    </section>
  );
};

export default FailureSurface;
