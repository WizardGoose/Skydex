import React, { useEffect, useRef } from "react";
import TourBody from "./TourBody";
import { SITE_NAME } from "../../ui/brand";
import "./welcome-overlay.css";

const WelcomeOverlay: React.FC<{ finish: () => void }> = ({ finish }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Welcome to ${SITE_NAME}`}
      className="welcome-overlay sd-toolkit"
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) finish();
      }}
    >
      <div className="welcome-overlay-content">
        <TourBody finish={finish} />
      </div>
    </dialog>
  );
};

export default WelcomeOverlay;
