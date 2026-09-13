import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  greenhouseTargetFromLocation,
  parseGreenhouseHash,
  type GreenhouseTool,
} from "./route";
import { GreenhouseWorkspace } from "./GreenhouseWorkspace";

export interface GreenhouseRouteWorkspaceProps {
  focusTool: GreenhouseTool;
  linkedTarget: string | null;
}

interface GreenhouseHashRouteProps {
  /** Injectable only so the hash adapter stays a small, server-renderable test. */
  Workspace?: React.ComponentType<GreenhouseRouteWorkspaceProps>;
}

/** Keeps old fragment links while presenting one plot instead of three modes. */
export const GreenhouseHashRoute: React.FC<GreenhouseHashRouteProps> = ({ Workspace = GreenhouseWorkspace }) => {
  const location = useLocation();
  const [nativeHash, setNativeHash] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setNativeHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => setNativeHash(null), [location.hash]);

  const hash = nativeHash ?? location.hash;
  const tool: GreenhouseTool = parseGreenhouseHash(hash).tool;
  const linkedTarget = greenhouseTargetFromLocation(hash, location.search);
  return <Workspace focusTool={tool} linkedTarget={linkedTarget} />;
};
