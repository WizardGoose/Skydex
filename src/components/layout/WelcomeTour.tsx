import React, { Suspense, lazy, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { closeTourLocation, hasSeenTour, isTourRequested, markTourSeen, REPLAY_EVENT } from "./tourState";
import { SETTINGS_PARAM } from "./settingsRoute";

const WelcomeOverlay = lazy(() => import("./WelcomeOverlay"));
type TourPhase = "closed" | "waiting" | "open";

/** The welcome sits above the current route without replacing its workspace. */
export const WelcomeTour: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = isTourRequested(location.search);
  const settingsOpen = new URLSearchParams(location.search).get(SETTINGS_PARAM) === "1";
  const [phase, setPhase] = useState<TourPhase>(() =>
    requested ? "open" : hasSeenTour() ? "closed" : "waiting"
  );

  const dismiss = () => {
    markTourSeen();
    setPhase("closed");
    if (requested) navigate(closeTourLocation(location), { replace: true });
  };

  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = window.setTimeout(() => setPhase("open"), 700);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const onReplay = () => setPhase("open");
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    if (requested) setPhase("open");
  }, [requested]);

  // Router transitions can close Settings after the replay event has arrived.
  // Let Settings release its focus and scroll lock before mounting this dialog.
  return phase === "open" && !settingsOpen ? (
    <Suspense fallback={null}>
      <WelcomeOverlay finish={dismiss} />
    </Suspense>
  ) : null;
};
