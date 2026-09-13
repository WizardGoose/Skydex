import React, { Suspense, lazy, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { FOCUS } from "../../ui/kit";
import { closeSettingsLocation, SETTINGS_PARAM } from "./settingsRoute";

const SiteSettingsPage = lazy(() =>
  import("../../pages/SiteSettingsPage").then((m) => ({ default: m.SiteSettingsPage }))
);

/**
 * Settings, as a window over the site rather than a page of it.
 *
 * The whole site stays where it is behind a quiet neutral veil; one panel
 * floats on top carrying the settings surface. Opening is `?settings=1` on
 * whatever address you are already at, so the state is linkable, the back
 * button closes it, and closing returns you to exactly the page you were on
 * with nothing remounted.
 *
 * Settings deliberately applies no backdrop blur or colour bloom. The veil
 * only dims the route beneath it, keeping the workspace visually still while
 * the user changes preferences.
 */

export const SettingsOverlay: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open = searchParams.get(SETTINGS_PARAM) === "1";
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  const close = () => {
    navigate(closeSettingsLocation(location));
  };

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };


  /* Esc closes; the page under the veil must not scroll while it is up. */
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current?.contains(active) ?? false;
      if (!inside || (e.shiftKey && (active === first || active === panelRef.current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="settings-overlay fixed inset-0 z-[70] flex items-start justify-center overflow-hidden px-3 py-4 sm:items-center sm:px-6 sm:py-8"
      onMouseDown={(e) => {
        /* The veil closes, the panel does not. mousedown rather than click so
           a text selection that ends outside the panel does not dismiss it. */
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="settings-shell sd-toolkit relative flex h-[calc(100dvh-2rem)] w-full max-w-[62rem] flex-col overflow-hidden outline-none sm:h-[calc(100dvh-4rem)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close settings"
          className={`settings-shell-close absolute right-3 top-3 z-10 cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="settings-shell-body relative flex min-h-0 flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
              </div>
            }
          >
            <SiteSettingsPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
};
