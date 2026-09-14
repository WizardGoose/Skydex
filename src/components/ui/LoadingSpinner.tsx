import React from "react";

export const LoadingSpinner: React.FC = () => (
  <div
    className="flex min-h-[calc(100dvh-var(--sd-chrome-h))] items-center justify-center"
    role="status"
    aria-label="Loading page"
  >
    <div
      aria-hidden="true"
      className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500/20 border-t-sky-500"
    />
  </div>
);
