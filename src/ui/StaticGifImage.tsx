import React, { useEffect, useRef, useState } from "react";
import { firstGifFrame } from "./staticGifFrame";

export interface StaticGifImageProps {
  src: string;
  width: number;
  height: number;
  className?: string;
  style?: React.CSSProperties;
  onFreezeError: () => void;
}

/** Paint one still frame without ever mounting the animated GIF as an image. */
export const StaticGifImage: React.FC<StaticGifImageProps> = ({
  src,
  width,
  height,
  className = "",
  style,
  onFreezeError,
}) => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [stillSrc, setStillSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let observer: IntersectionObserver | null = null;
    const load = () => {
      observer?.disconnect();
      void firstGifFrame(src).then(
        (resolved) => {
          if (live) setStillSrc(resolved);
        },
        () => {
          if (live) onFreezeError();
        },
      );
    };

    setStillSrc(null);
    if (typeof IntersectionObserver === "undefined" || !hostRef.current) {
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) load();
        },
        { rootMargin: "240px" },
      );
      observer.observe(hostRef.current);
    }

    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [onFreezeError, src]);

  return (
    <span
      ref={hostRef}
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width, height }}
      aria-hidden
    >
      {stillSrc && (
        <img
          src={stillSrc}
          alt=""
          width={width}
          height={height}
          className="h-full w-full object-contain"
          style={style}
        />
      )}
    </span>
  );
};

export default StaticGifImage;
