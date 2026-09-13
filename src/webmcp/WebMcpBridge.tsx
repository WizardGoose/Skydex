import { useEffect } from "react";
import { registerWebMcpTools } from "./platform";
import { createWebMcpTools } from "./tools";

const TOOLS = createWebMcpTools();

/** Invisible bridge: the visible Skydex UI remains the source of truth. */
export const WebMcpBridge = () => {
  useEffect(() => {
    const lifecycle = new AbortController();
    registerWebMcpTools(TOOLS, lifecycle.signal);
    return () => lifecycle.abort();
  }, []);

  return null;
};
