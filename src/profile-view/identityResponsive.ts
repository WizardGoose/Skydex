import { useEffect, useState } from "react";

/* The desktop identity header and mobile character caption are two
   presentations of one picker. Keep their mounted ownership in sync with the
   same breakpoint so the hidden presentation cannot become a second control. */
export const useCompactIdentity = (): boolean => {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(max-width: 820px)");
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return compact;
};
