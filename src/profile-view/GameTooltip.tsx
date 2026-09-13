import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHoverTooltips } from "../ui/useHoverTooltips";

type TooltipPlacement = "top" | "bottom";

interface TooltipPosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

interface GameTooltipProps {
  label: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "rift";
  ariaLabel?: string;
  wrapperClassName?: string;
  /** Keep links and other real child actions working instead of pinning this label. */
  preserveChildAction?: boolean;
  children: React.ReactElement;
}

const GAME_TOOLTIP_OPEN_EVENT = "skydex:game-tooltip-open";

const placeTooltip = (
  trigger: DOMRect,
  tooltip: DOMRect,
  viewport: { width: number; height: number },
): TooltipPosition => {
  const padding = 8;
  const gap = 8;
  const roomAbove = trigger.top - padding - gap;
  const roomBelow = viewport.height - trigger.bottom - padding - gap;
  const placement: TooltipPlacement = roomBelow >= tooltip.height || roomBelow >= roomAbove ? "bottom" : "top";
  const top = placement === "top" ? trigger.top - tooltip.height - gap : trigger.bottom + gap;
  const desiredLeft = trigger.left + trigger.width / 2 - tooltip.width / 2;
  const left = Math.max(padding, Math.min(desiredLeft, viewport.width - tooltip.width - padding));

  return {
    top: Math.max(padding, Math.min(top, viewport.height - tooltip.height - padding)),
    left,
    placement,
  };
};

export const GameTooltip: React.FC<GameTooltipProps> = ({
  label,
  icon,
  tone = "neutral",
  ariaLabel,
  wrapperClassName = "",
  preserveChildAction = false,
  children,
}) => {
  const hoverTooltips = useHoverTooltips();
  const lastPointer = useRef<string | null>(null);
  const tooltipId = `game-tooltip-${useId().replace(/:/g, "")}`;
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const open = hoverTooltips && !dismissed && (hovered || focused || pinned);

  useEffect(() => {
    if (hoverTooltips) return;
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }, [hoverTooltips]);

  const announceOpen = () => {
    if (typeof document === "undefined") return;
    document.dispatchEvent(new CustomEvent(GAME_TOOLTIP_OPEN_EVENT, { detail: { id: tooltipId } }));
  };

  useEffect(() => {
    const closeForOtherTooltip = (event: Event) => {
      const nextTooltipId = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!nextTooltipId || nextTooltipId === tooltipId) return;

      setHovered(false);
      setFocused(false);
      setPinned(false);
      setDismissed(true);
    };

    document.addEventListener(GAME_TOOLTIP_OPEN_EVENT, closeForOtherTooltip);
    return () => document.removeEventListener(GAME_TOOLTIP_OPEN_EVENT, closeForOtherTooltip);
  }, [tooltipId]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!triggerRef.current || !tooltipRef.current) return;
        setPosition(placeTooltip(
          triggerRef.current.getBoundingClientRect(),
          tooltipRef.current.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
        ));
      });
    };

    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, { capture: true, passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(triggerRef.current);
    resizeObserver?.observe(tooltipRef.current);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, { capture: true });
      resizeObserver?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setPinned(false);
        setDismissed(true);
      }
    };

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [pinned]);

  const child = React.Children.only(children);
  const childProps = child.props as Record<string, unknown>;
  const trigger = React.cloneElement(child, {
    ...(ariaLabel && !childProps["aria-label"] ? { "aria-label": ariaLabel } : {}),
    "aria-describedby": open ? tooltipId : undefined,
  } as React.HTMLAttributes<HTMLElement>);
  if (!hoverTooltips) return <div className={wrapperClassName}>{trigger}</div>;

  return (
    <div
      ref={triggerRef}
      className={wrapperClassName}
      data-game-tooltip-trigger
      data-tooltip-pinned={pinned ? "true" : "false"}
      onPointerDownCapture={(event) => {
        lastPointer.current = event.pointerType;
        if (event.pointerType === "touch") {
          setHovered(false);
          setFocused(false);
          setPinned(false);
          setDismissed(true);
        }
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        announceOpen();
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setHovered(false);
      }}
      onFocusCapture={() => {
        if (lastPointer.current === "touch") return;
        announceOpen();
        setDismissed(false);
        setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setDismissed(false);
        }
      }}
      onKeyDownCapture={(event) => {
        lastPointer.current = null;
        if (event.key !== "Escape") return;
        event.stopPropagation();
        setPinned(false);
        setDismissed(true);
      }}
      onClickCapture={(event) => {
        if (lastPointer.current === "touch") return;
        if (tooltipRef.current?.contains(event.target as Node)) return;
        if (preserveChildAction) return;
        event.preventDefault();
        announceOpen();
        setDismissed(false);
        setPinned((value) => !value);
      }}
    >
      {trigger}
      {open && typeof document !== "undefined" && createPortal(
        <div
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          data-placement={position?.placement}
          data-tone={tone}
          data-pinned={pinned ? "true" : "false"}
          className="game-tooltip"
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            visibility: position ? "visible" : "hidden",
          }}
        >
          {icon && <span className="game-tooltip-icon" aria-hidden>{icon}</span>}
          <strong>{label}</strong>
        </div>,
        document.body,
      )}
    </div>
  );
};
