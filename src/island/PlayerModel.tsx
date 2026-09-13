import React, { useEffect, useRef, useState } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { skinUrl } from "./heads";
import { applyVoxelLayers } from "./voxelLayers";

const IDLE_FRAME_INTERVAL_MS = 125;
const IDLE_AUTO_PREVIEW_MS = 2_500;

/**
 * The idle pose only rotates a few joints, so a full display-rate WebGL loop
 * wastes work without making the motion meaningfully smoother. Eight frames
 * per second suits the pixel-art model. It plays briefly when the model enters
 * view and while the pointer is over it, then returns to change-only rendering.
 */
const startIdleAnimation = (viewer: SkinViewer, target: Element): (() => void) => {
  const idle = new IdleAnimation();
  idle.speed = 0.58;
  viewer.animation = idle;

  let disposed = false;
  let inViewport = typeof IntersectionObserver === "undefined";
  let pointerActive = false;
  let previewRemainingMs = IDLE_AUTO_PREVIEW_MS;
  let previewStartedAt: number | null = null;
  let previewTimer: number | null = null;
  let lastFrameAt: number | null = null;
  let timer: number | null = null;
  let frame: number | null = null;

  const canAnimate = () =>
    !disposed
    && inViewport
    && document.visibilityState === "visible"
    && (pointerActive || previewRemainingMs > 0);

  const cancelScheduledFrame = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
  };

  const schedule = () => {
    if (!canAnimate() || timer !== null || frame !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (!canAnimate()) return;
      frame = window.requestAnimationFrame((now) => {
        frame = null;
        if (!canAnimate()) {
          lastFrameAt = null;
          return;
        }
        const elapsedSeconds = lastFrameAt === null
          ? IDLE_FRAME_INTERVAL_MS / 1_000
          : Math.min((now - lastFrameAt) / 1_000, 0.25);
        lastFrameAt = now;
        idle.update(viewer.playerObject, elapsedSeconds);
        viewer.render();
        schedule();
      });
    }, IDLE_FRAME_INTERVAL_MS);
  };

  const pausePreviewClock = () => {
    if (previewTimer !== null) {
      window.clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (previewStartedAt !== null) {
      previewRemainingMs = Math.max(
        0,
        previewRemainingMs - (performance.now() - previewStartedAt),
      );
      previewStartedAt = null;
    }
  };

  const syncActivity = () => {
    const visible = !disposed && inViewport && document.visibilityState === "visible";
    if (visible && previewRemainingMs > 0 && previewTimer === null) {
      previewStartedAt = performance.now();
      previewTimer = window.setTimeout(() => {
        previewTimer = null;
        previewStartedAt = null;
        previewRemainingMs = 0;
        syncActivity();
      }, previewRemainingMs);
    } else if (!visible) {
      pausePreviewClock();
    }

    if (canAnimate()) {
      schedule();
    } else {
      cancelScheduledFrame();
      lastFrameAt = null;
    }
  };

  const onPointerEnter = () => {
    pointerActive = true;
    syncActivity();
  };
  const onPointerLeave = () => {
    pointerActive = false;
    syncActivity();
  };

  const observer = typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(([entry]) => {
        inViewport = entry?.isIntersecting ?? false;
        syncActivity();
      });
  observer?.observe(target);
  target.addEventListener("pointerenter", onPointerEnter);
  target.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", syncActivity);
  syncActivity();

  return () => {
    disposed = true;
    pausePreviewClock();
    cancelScheduledFrame();
    observer?.disconnect();
    target.removeEventListener("pointerenter", onPointerEnter);
    target.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", syncActivity);
  };
};

/**
 * The player, standing in the profile page's sharp channel.
 *
 * Rendered by skinview3d (MIT, bs-community; pinned in package.json and
 * credited in NOTICE.md). The skin comes from MCHeads' `/skin/<uuid>` endpoint
 * because a WebGL texture demands a CORS-clean image and that endpoint was
 * verified to serve one; see heads.ts.
 *
 * This is the gui-redesign prototype's viewer carrying the
 * live site's fallback discipline. What each parent contributed:
 *
 * FROM THE LIVE SITE, learned the hard way here first:
 *   - STILL BY DEFAULT. Callers can opt into a quiet joint-level idle pose;
 *     drag to turn remains available and zoom remains off.
 *   - THE SKIN LOADS THROUGH THE PROMISE, not the constructor. `new
 *     SkinViewer({ skin })` fires `loadSkin` asynchronously and nothing
 *     catches it, so a failed fetch leaves an UNTEXTURED dark smear. Failure
 *     here leaves the model absent instead of substituting a differently
 *     framed flat body; lost WebGL contexts take the same quiet path.
 *   - NO ARMOR MESHES: skinview3d 3.4.2 renders skin, cape, ears and elytra
 *     only (verified against the library's exports), so worn armor is shown
 *     in the Gear tab rather than on the body.
 *
 * FROM THE PROTOTYPE, each measured there:
 *   - THE CANVAS IS CREATED PER VIEWER, not held in JSX. A WebGL context is
 *     bound to its canvas element for the element's life, so React
 *     StrictMode's double-mount threw on the reused canvas and silently showed
 *     the fallback - in dev only, which is why production looked fine.
 *   - IT SIZES ITSELF. The host div is measured with a ResizeObserver and the
 *     viewer follows it, so the caller sets size with CSS (pin an aspect
 *     ratio; the framing correction depends on it).
 *   - CAMERA framing, not model translation: the model stays on the origin so
 *     the orbit pivot is its own middle, and the known projection offset is
 *     corrected with a CSS translate that OrbitControls (delta-based) never
 *     notice.
 *   - VOXEL LAYERS: the outer skin layer built as real geometry (one voxel
 *     per opaque texel) instead of a flat transparent shell, with the hidden
 *     hat-underside culled and a measured geometric gap preventing the flat
 *     body and voxel shell from sharing a depth plane. Failure degrades to the
 *     library's own flat shell.
 */

interface Props {
  uuid: string;
  /** Size with CSS on the caller, pinned to an aspect (e.g. aspect-[360/612]). */
  className?: string;
  yaw?: number;
  pitch?: number;
  zoom?: number;
  /** Framing correction, in % of the canvas. Measured at aspect 360/612. */
  frameX?: number;
  frameY?: number;
  voxelLayers?: boolean;
  /** Animate the character's joints in place. The canvas itself never drifts. */
  animate?: boolean;
}

export const PlayerModel: React.FC<Props> = ({
  uuid,
  className = "",
  yaw = -0.34,
  pitch = 0.04,
  zoom = 0.78,
  frameX = -2.8,
  frameY = 6.9,
  voxelLayers = true,
  animate = false,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [fallback, setFallback] = useState<null | "webgl" | "skin" | "context">(null);

  const skin = skinUrl(uuid);
  const canRenderModel = fallback === null;

  /* Measure first. Nothing is built until there is a real size to build at. */
  useEffect(() => {
    if (!canRenderModel) return;
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [canRenderModel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !size || !skin) return;
    /* A brand new element every time. See the header. */
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.cursor = "grab";
    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";
    canvas.title = "Drag to turn the model.";
    canvas.setAttribute("aria-label", "3D render of the player's skin. Drag to rotate.");
    /* The projection offset correction. See the header: CSS moves the
       picture, the scene and its pivot stay put. */
    canvas.style.transform = `translate(${frameX}%, ${frameY}%)`;
    host.appendChild(canvas);

    let viewer: SkinViewer | null = null;
    let renderViewer: (() => void) | null = null;
    let stopIdleAnimation: (() => void) | null = null;
    let live = true;

    const onContextLost = () => {
      if (live) setFallback("context");
    };

    try {
      /* Static callers stay paused and render only on real changes. The
         profile preview uses a capped, visible-only joint animation that
         never translates the player or its canvas. */
      viewer = new SkinViewer({ canvas, width: size.w, height: size.h, renderPaused: true });
      viewer.controls.enableZoom = false;
      viewer.autoRotate = false;
      viewer.zoom = zoom;
      if (animate) stopIdleAnimation = startIdleAnimation(viewer, host);
      const activeViewer = viewer;
      renderViewer = () => activeViewer.render();
      viewer.controls.addEventListener("change", renderViewer);

      /* The second skin layer, set explicitly for all six parts: "defaults to
         on" is not the same as "is on", and on skins whose crown IS the hat
         layer its absence is invisible until you know what to look for. */
      const skinObj = viewer.playerObject.skin;
      for (const part of [
        skinObj.head,
        skinObj.body,
        skinObj.rightArm,
        skinObj.leftArm,
        skinObj.rightLeg,
        skinObj.leftLeg,
      ]) {
        part.innerLayer.visible = true;
        part.outerLayer.visible = true;
      }

      /* Pose via the CAMERA, keeping the model on the origin so the orbit
         pivot is its own middle. Only the azimuth turns; the pitch is a small
         lift, never a replacement of the camera's Y. */
      const cam = viewer.camera;
      const target = viewer.controls.target;
      const dx = cam.position.x - target.x;
      const dz = cam.position.z - target.z;
      const radius = Math.hypot(dx, dz);
      const azimuth = Math.atan2(dx, dz) + yaw;
      cam.position.x = target.x + Math.sin(azimuth) * radius;
      cam.position.z = target.z + Math.cos(azimuth) * radius;
      cam.position.y += pitch * radius;
      viewer.controls.update();
      viewer.render();
      viewerRef.current = viewer;
    } catch {
      canvas.remove();
      setFallback("webgl");
      return;
    }

    canvas.addEventListener("webglcontextlost", onContextLost, false);

    let disposeVoxels: (() => void) | null = null;
    const built = viewer;

    viewer
      .loadSkin(skin)
      .then(() => {
        if (!live) return;
        built.render();
        canvas.style.opacity = "1";
        canvas.style.pointerEvents = "auto";
        if (!voxelLayers) return;
        /* The sheet is decoded a second time, deliberately: reading texels
           back off the GPU is slower and lossier than re-decoding the 64x64
           PNG from cache. crossOrigin because the canvas reads its pixels. */
        const sheet = new Image();
        sheet.crossOrigin = "anonymous";
        sheet.onload = () => {
          if (!live) return;
          try {
            disposeVoxels = applyVoxelLayers(built.playerObject, sheet);
            built.render();
          } catch {
            /* Geometry failed; the flat shell is still there and still right,
               so this degrades to the normal render rather than to nothing. */
          }
        };
        sheet.src = skin;
      })
      .catch(() => {
        if (live) setFallback("skin");
      });

    return () => {
      live = false;
      canvas.removeEventListener("webglcontextlost", onContextLost, false);
      if (renderViewer) viewer?.controls.removeEventListener("change", renderViewer);
      stopIdleAnimation?.();
      disposeVoxels?.();
      viewer?.dispose();
      viewerRef.current = null;
      canvas.remove();
    };
    /* Size is intentionally NOT a dependency: a resize should resize the
       viewer (the effect below), not rebuild the WebGL context. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, size !== null, yaw, pitch, zoom, frameX, frameY, voxelLayers, animate]);

  useEffect(() => {
    if (size && viewerRef.current) {
      viewerRef.current.setSize(size.w, size.h);
      viewerRef.current.render();
    }
  }, [size]);

  if (!skin || fallback !== null) return <div className={className} aria-hidden />;

  return (
    <div ref={hostRef} className={className} />
  );
};

export default PlayerModel;
