import React, { useState } from "react";
import { useIsland } from "./useIsland";
import { ago } from "./format";
import { BTN_PRIMARY, INPUT, LABEL, PANEL, SectionHead } from "../ui/kit";

/** Shared local-only island snapshot import used by onboarding and Settings. */
export const IslandSnapshotImportPanel: React.FC<{ title?: string }> = ({ title = "Paste an island code" }) => {
  const { applyCode } = useIsland();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);

  const onLoad = async () => {
    setBusy(true);
    setError(null);
    setLoadedNote(null);
    try {
      const next = await applyCode(code);
      const items = next.chests.reduce((count, chest) => count + chest.items.length, 0);
      setLoadedNote(
        `${next.player.name || "Unknown player"} · ${next.profile.name || "profile"} · ` +
          `${Object.keys(next.sacks).length} sack entries, ${next.chests.length} chests, ${items} chest items · ` +
          `exported ${ago(next.exportedAt)}`
      );
      setCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={PANEL} data-inventory-snapshot-import>
      <SectionHead title={title} right={<span className={LABEL}>/skydex copy</span>} />
      <div className="space-y-2 p-3">
        <textarea
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
          rows={3}
          spellCheck={false}
          placeholder="SKYDEX-..."
          className={`${INPUT} w-full resize-y font-mono leading-snug`}
          aria-label="Island snapshot code"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className={BTN_PRIMARY} onClick={() => void onLoad()} disabled={busy || code.trim() === ""}>
            {busy ? "Loading..." : "Load snapshot"}
          </button>
        </div>
        {error && (
          <p className="border-l-2 border-red-500/50 pl-2 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        )}
        {loadedNote && <p className="text-[11px] text-emerald-300">Loaded {loadedNote}</p>}
      </div>
    </div>
  );
};

export default IslandSnapshotImportPanel;
