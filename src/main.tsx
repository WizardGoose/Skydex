import "./storage/bootstrap";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AppWithRedirect } from "./components/AppWithRedirect";

/**
 * Upstream SkyShards ran a localStorage "cleanup" here on every page load: a
 * hardcoded allowlist of eight key names, deleting everything else.
 *
 * That silently destroyed state on every reload. It predated the greenhouse
 * merge, so it wiped the Designer layout, the grid config, the locked
 * placements, the mutation targets and the planner's saved grind progress,
 * every time the page loaded. The current migration copies and verifies each
 * owned value before retiring its old key; unrelated keys remain untouched.
 *
 * If key pruning is ever needed again, allowlist by PREFIX (`wizardsky.`,
 * `skyshards-`) rather than by exact name, so new features do not get wiped
 * the moment they are added.
 */

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppWithRedirect />
  </StrictMode>
);
