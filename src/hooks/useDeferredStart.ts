import { useEffect, useState } from "react";

export const useDeferredStart = (): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    const start = () => {
      if (live) setReady(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 2000 });
      return () => {
        live = false;
        window.cancelIdleCallback(handle);
      };
    }

    const handle = window.setTimeout(start, 300);
    return () => {
      live = false;
      window.clearTimeout(handle);
    };
  }, []);

  return ready;
};
