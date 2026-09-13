import React, { useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Layers3, Trash2, Upload } from "lucide-react";
import { parseTexturePack } from "../items/texturePackParse";
import {
  adoptTexturePack,
  moveTexturePack,
  removeTexturePack,
  setTexturePackEnabled,
  subscribeTexturePack,
  texturePackEntries,
  texturePackVersion,
} from "../items/texturePack";
import { ago } from "../island/format";
import { BTN, BTN_QUIET, PANEL, SectionHead, Tag } from "./kit";

/** Destructive control, in the kit's one destructive colour. */
const BTN_DANGER = `${BTN} bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/35 hover:border-red-400/50`;
const PACK_ICON_BUTTON = `${BTN_QUIET} settings-pack-icon-button`;

type Phase =
  | { state: "idle" }
  | { state: "working"; message: string }
  | { state: "error"; message: string };

export const TexturePackPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  useSyncExternalStore(subscribeTexturePack, texturePackVersion, texturePackVersion);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = texturePackEntries();
  const busy = phase.state === "working";
  const enabled = entries.filter((entry) => entry.enabled).length;

  const run = async (message: string, operation: () => Promise<void>): Promise<void> => {
    setPhase({ state: "working", message });
    try {
      await operation();
      setPhase({ state: "idle" });
    } catch (error) {
      setPhase({
        state: "error",
        message: error instanceof Error ? error.message : "That texture-pack change could not be saved.",
      });
    }
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    await run(`Reading ${file.name}…`, async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseTexturePack(bytes);
      await adoptTexturePack(parsed, file.name);
    });
    // Picking the same archive again must still fire `change`.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={PANEL}>
      <SectionHead
        title="Texture packs"
        right={
          entries.length > 0 ? (
            <Tag accent>
              {enabled}/{entries.length} on
            </Tag>
          ) : (
            <span className="text-[10px] text-slate-400">none loaded</span>
          )
        }
      />
      <div className="space-y-2 p-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          {compact
            ? "Stack packs you already own. The top enabled pack wins when two packs provide the same item texture."
            : "Load texture packs you downloaded yourself, order them by priority, and turn any pack off without deleting it. The top enabled pack wins whenever two packs provide the same item texture. Every archive stays in this browser."}
        </p>

        {entries.length > 0 ? (
          <div className="settings-pack-stack" aria-label="Texture pack priority, highest first">
            {entries.map((entry, index) => (
              <article
                key={entry.id}
                className="settings-pack-entry"
                data-enabled={entry.enabled || undefined}
              >
                <div className="settings-pack-priority" title={`Priority ${index + 1}`}>
                  <span>#</span>
                  <strong>{index + 1}</strong>
                </div>

                <label className="settings-pack-toggle">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    disabled={busy}
                    aria-label={`${entry.enabled ? "Disable" : "Enable"} ${entry.name}`}
                    onChange={(event) => {
                      const next = event.currentTarget.checked;
                      void run(`${next ? "Enabling" : "Disabling"} ${entry.name}…`, () =>
                        setTexturePackEnabled(entry.id, next),
                      );
                    }}
                  />
                  <span className="settings-pack-toggle-track" aria-hidden>
                    <span />
                  </span>
                  <span>{entry.enabled ? "On" : "Off"}</span>
                </label>

                <div className="settings-pack-copy">
                  <strong title={entry.name}>{entry.name}</strong>
                  {entry.description && <span title={entry.description}>{entry.description}</span>}
                  <small>
                    {entry.counts.recognised.toLocaleString()} item textures · loaded {ago(entry.loadedAt)}
                  </small>
                </div>

                <div className="settings-pack-actions">
                  <button
                    type="button"
                    className={PACK_ICON_BUTTON}
                    disabled={busy || index === 0}
                    aria-label={`Raise ${entry.name} priority`}
                    title="Raise priority"
                    onClick={() => void run(`Moving ${entry.name}…`, () => moveTexturePack(entry.id, -1))}
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={PACK_ICON_BUTTON}
                    disabled={busy || index === entries.length - 1}
                    aria-label={`Lower ${entry.name} priority`}
                    title="Lower priority"
                    onClick={() => void run(`Moving ${entry.name}…`, () => moveTexturePack(entry.id, 1))}
                  >
                    <ChevronDown aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={`${BTN_DANGER} settings-pack-icon-button`}
                    disabled={busy}
                    aria-label={`Remove ${entry.name}`}
                    title="Remove pack"
                    onClick={() => void run(`Removing ${entry.name}…`, () => removeTexturePack(entry.id))}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="settings-pack-empty">
            <Layers3 aria-hidden />
            <span>Add a pack to replace supported item textures across Skydex.</span>
          </div>
        )}

        <div className="settings-pack-footer">
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className={BTN_QUIET}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3 w-3" aria-hidden />
            {phase.state === "working" ? phase.message : entries.length > 0 ? "Add another pack" : "Add a pack zip"}
          </button>
          {entries.length > 1 && <span>Priority 1 wins conflicts.</span>}
        </div>

        {phase.state === "error" && <p className="text-[11px] text-red-300">{phase.message}</p>}

        <details className="settings-disclosure">
          <summary>Supported packs and local file details</summary>
          <div className="settings-disclosure-body text-[11px] leading-relaxed text-slate-400">
            <p>
              Catharsis-format packs, including FurfSky Reborn v2 and .cats archives, are read by SkyBlock item id.
              Plain vanilla-layout packs contribute item textures as a best effort. OptiFine CIT is not supported.
            </p>
            <p>
              Packs stay their authors&rsquo; work under their authors&rsquo; licences. Skydex stores your local copies,
              but uploads, bundles and re-hosts none of them.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default TexturePackPanel;
