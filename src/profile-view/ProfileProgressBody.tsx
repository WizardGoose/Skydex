import type { ReactNode } from "react";

/** Shared skill-row geometry; domain-specific labels and progress stay with callers. */
export function ProfileProgressBody({ children }: { children: ReactNode }) {
  return <span className="profile-skill-body profile-progress-row-body">{children}</span>;
}
