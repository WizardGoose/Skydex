import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProfileMetricView } from "../profile/profileViewModel";
import { ItemIcon } from "../ui/ItemIcon";
import { WikiLink } from "../ui/WikiLink";
import { useHoverTooltips } from "../ui/useHoverTooltips";

type ProfileInfoPlacement = "top" | "bottom";

interface ProfileInfoPosition {
  top: number;
  left: number;
  placement: ProfileInfoPlacement;
  maxHeight: number;
}

interface ProfileInfoPopoverProps {
  title: string;
  info: NonNullable<ProfileMetricView["info"]> & { notes?: string[] };
  ariaLabel: string;
  wrapperClassName?: string;
  /** Preserve the action and ARIA state of an existing control. */
  triggerMode?: "information" | "control";
  activation?: "hover" | "click";
  details?: React.ReactNode;
  children: React.ReactElement;
}

const PROFILE_INFO_OPEN_EVENT = "skydex:profile-info-open";
const SKYDEX_MOD_URL = "https://github.com/WizardGoose/Skydex";

const profileInfoNote = (note: string): React.ReactNode => {
  const label = "Skydex mod";
  const index = note.indexOf(label);
  if (index < 0) return note;
  return (
    <>
      {note.slice(0, index)}
      <a
        className="profile-info-popover-mod-link"
        href={SKYDEX_MOD_URL}
        target="_blank"
        rel="noreferrer"
      >
        {label}
      </a>
      {note.slice(index + label.length)}
    </>
  );
};

const placeProfileInfo = (
  trigger: DOMRect,
  popover: DOMRect,
  viewport: { width: number; height: number },
): ProfileInfoPosition => {
  const padding = 8;
  const topPadding = 64;
  const gap = 6;
  const roomAbove = trigger.top - topPadding - gap;
  const roomBelow = viewport.height - trigger.bottom - padding - gap;
  // Pick a side from the trigger position, not the measured popover height.
  // The latter changes after max-height is applied and can make the surface
  // flip above and below the pointer while it is being entered.
  const placement: ProfileInfoPlacement = roomAbove >= 10 * 16 || roomAbove >= roomBelow ? "top" : "bottom";
  const availableHeight = Math.max(5 * 16, placement === "top" ? roomAbove : roomBelow);
  const height = Math.min(popover.height, availableHeight);
  const top = placement === "top" ? trigger.top - height - gap : trigger.bottom + gap;
  const desiredLeft = trigger.right - popover.width;
  const left = Math.max(padding, Math.min(desiredLeft, viewport.width - popover.width - padding));

  return {
    top: Math.max(topPadding, Math.min(top, viewport.height - height - padding)),
    left,
    placement,
    maxHeight: availableHeight,
  };
};

export const ProfileInfoPopover: React.FC<ProfileInfoPopoverProps> = ({
  title,
  info,
  ariaLabel,
  wrapperClassName = "",
  triggerMode = "information",
  activation = "hover",
  details,
  children,
}) => {
  const hoverTooltips = useHoverTooltips();
  const lastPointer = useRef<string | null>(null);
  const popoverId = `profile-info-${useId().replace(/:/g, "")}`;
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [surfaceHovered, setSurfaceHovered] = useState(false);
  const [triggerFocused, setTriggerFocused] = useState(false);
  const [surfaceFocused, setSurfaceFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<ProfileInfoPosition | null>(null);
  const clickOnly = activation === "click" || !hoverTooltips;
  const open = !dismissed && (pinned || (!clickOnly && (triggerHovered || surfaceHovered || triggerFocused || surfaceFocused)));
  const variant = info.variant ?? "default";

  const cancelScheduledClose = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleTriggerClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setTriggerHovered(false);
      closeTimerRef.current = null;
    }, 220);
  };

  const announceOpen = () => {
    document.dispatchEvent(new CustomEvent(PROFILE_INFO_OPEN_EVENT, { detail: { id: popoverId } }));
  };

  useEffect(() => () => cancelScheduledClose(), []);

  useEffect(() => {
    const closeForOtherInfo = (event: Event) => {
      const nextId = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!nextId || nextId === popoverId) return;

      cancelScheduledClose();
      setTriggerHovered(false);
      setSurfaceHovered(false);
      setTriggerFocused(false);
      setSurfaceFocused(false);
      setPinned(false);
      setDismissed(true);
    };

    document.addEventListener(PROFILE_INFO_OPEN_EVENT, closeForOtherInfo);
    return () => document.removeEventListener(PROFILE_INFO_OPEN_EVENT, closeForOtherInfo);
  }, [popoverId]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!triggerRef.current || !popoverRef.current) return;
        setPosition(placeProfileInfo(
          triggerRef.current.getBoundingClientRect(),
          popoverRef.current.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
        ));
      });
    };

    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, { capture: true, passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resizeObserver?.observe(triggerRef.current);
    resizeObserver?.observe(popoverRef.current);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, { capture: true });
      resizeObserver?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;

    const closeOutside = (event: Event) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setPinned(false);
      setDismissed(true);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setDismissed(true);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("click", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("click", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pinned]);

  useEffect(() => {
    if (!open || !triggerRef.current || typeof IntersectionObserver === "undefined") return;
    const trigger = triggerRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio > 0) return;
      cancelScheduledClose();
      setTriggerHovered(false);
      setSurfaceHovered(false);
      setTriggerFocused(false);
      setSurfaceFocused(false);
      setPinned(false);
      setDismissed(true);
    }, { threshold: 0 });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [open]);

  const child = React.Children.only(children);
  const childAttributes = child.props as React.HTMLAttributes<HTMLElement>;
  const trigger = React.cloneElement(child, triggerMode === "control" ? {
    "aria-describedby": [childAttributes["aria-describedby"], open ? popoverId : null].filter(Boolean).join(" ") || undefined,
  } : {
    "aria-label": ariaLabel,
    "aria-controls": popoverId,
    "aria-expanded": open,
    "aria-haspopup": "dialog",
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <div
      ref={triggerRef}
      className={wrapperClassName}
      data-profile-info-trigger
      data-tooltip-pinned={pinned ? "true" : "false"}
      data-info-activation={activation}
      onPointerDownCapture={(event) => { lastPointer.current = event.pointerType; }}
      onPointerEnter={(event) => {
        if (clickOnly) return;
        if (popoverRef.current?.contains(event.target as Node) || event.pointerType === "touch") return;
        cancelScheduledClose();
        announceOpen();
        setDismissed(false);
        setTriggerHovered(true);
      }}
      onPointerLeave={(event) => {
        if (clickOnly) return;
        const nextTarget = event.relatedTarget;
        if ((nextTarget instanceof Node && popoverRef.current?.contains(nextTarget)) || event.pointerType === "touch") return;
        scheduleTriggerClose();
      }}
      onFocusCapture={(event) => {
        if (clickOnly || lastPointer.current === "touch") return;
        if (popoverRef.current?.contains(event.target as Node)) return;
        announceOpen();
        setDismissed(false);
        setTriggerFocused(true);
      }}
      onBlurCapture={(event) => {
        if (popoverRef.current?.contains(event.target as Node)) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTriggerFocused(false);
      }}
      onKeyDownCapture={(event) => {
        lastPointer.current = null;
        if (event.key !== "Escape") return;
        event.stopPropagation();
        setPinned(false);
        setDismissed(true);
      }}
      onClickCapture={(event) => {
        if (triggerMode === "control") return;
        if (popoverRef.current?.contains(event.target as Node)) {
          setPinned(true);
          return;
        }
        event.preventDefault();
        announceOpen();
        setDismissed(false);
        setPinned(!pinned);
      }}
    >
      {trigger}
      {open && typeof document !== "undefined" && createPortal(
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-label={`${title} information`}
          data-placement={position?.placement}
          data-pinned={pinned ? "true" : "false"}
          className={`profile-info-popover profile-info-popover--${variant}${clickOnly ? " profile-info-popover--click" : ""}`}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            maxHeight: position?.maxHeight,
            visibility: position ? "visible" : "hidden",
          }}
          onPointerEnter={() => {
            cancelScheduledClose();
            setTriggerHovered(false);
            setSurfaceHovered(true);
          }}
          onPointerLeave={() => setSurfaceHovered(false)}
          onFocusCapture={() => setSurfaceFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSurfaceFocused(false);
          }}
        >
          <header className="profile-info-popover-head">
            <strong>{title}</strong>
            {clickOnly && <button type="button" className="profile-info-close" aria-label={`Close ${title} information`}
              onClick={() => { setPinned(false); setDismissed(true); triggerRef.current?.querySelector<HTMLElement>("button, [tabindex='0']")?.focus(); }}>×</button>}
          </header>
          {info.hero && (
            <div className="profile-info-popover-hero">
              {info.hero.label && <small>{info.hero.label}</small>}
              <strong className="profile-number">{info.hero.value}</strong>
            </div>
          )}
          {info.summary && <p className="profile-info-popover-summary">{info.summary}</p>}
          {info.rows && info.rows.length > 0 && (
            <dl className={`profile-info-popover-rows profile-info-popover-rows--${variant}`}>
              {info.rows.map((row) => (
                <div className={row.tone ? `profile-info-popover-row--${row.tone}` : undefined} key={`${row.label}-${row.value}`}>
                  <dt>
                    <span className="profile-info-popover-row-label">
                      {row.icon && (
                        <span className="profile-info-popover-row-icon" aria-hidden>
                          <ItemIcon name={row.icon} id={row.iconId} size={16} fallback="initials" />
                        </span>
                      )}
                      <span>{row.label}</span>
                    </span>
                    {row.source && <small>{row.source}</small>}
                  </dt>
                  <dd className="profile-number">{row.value}</dd>
                  {typeof row.share === "number" && (
                    <span className="profile-info-popover-bar" aria-hidden>
                      <span style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }} />
                    </span>
                  )}
                </div>
              ))}
            </dl>
          )}
          {details}
          {info.note && <p className="profile-info-popover-note">{profileInfoNote(info.note)}</p>}
          {!!info.notes?.length && <ul className="profile-info-popover-notes">{info.notes.map((note, index) => <li key={index}>{profileInfoNote(note)}</li>)}</ul>}
          {info.wiki && (
            <WikiLink
              name={info.wiki.name}
              href={info.wiki.href}
              className="profile-info-popover-wiki"
              title={`Open ${info.wiki.name} on the wiki`}
            >
              {info.wiki.label}
            </WikiLink>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};
