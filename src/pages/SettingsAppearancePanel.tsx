import React, { useEffect, useRef, useState } from "react";
import { Check, Image as ImageIcon, RotateCcw, Upload } from "lucide-react";
import { TexturePackPanel } from "../ui/TexturePackPanel";
import { Wordmark } from "../ui/Wordmark";
import {
  DEFAULT_BACKDROP_PREFERENCES,
  type BackdropFlag,
  type BackdropHorizontalFocus,
  type BackdropPreferences,
  type BackdropVerticalFocus,
  clearBackdrop,
  loadBackdropUrl,
  MAX_BACKDROP_BYTES,
  readBackdropFlag,
  readBackdropPreferences,
  saveBackdrop,
  saveBackdropPreferences,
} from "../ui/backdrop";
import {
  BTN_PRIMARY,
  BTN_QUIET,
  ControlGrid,
  ControlRow,
  PANEL,
  SectionHead,
  Segmented,
  SliderRow,
  Tag,
} from "../ui/kit";

type PreviewSource = "hub" | "custom";
type PendingBackdrop = { file: File; url: string };

const HORIZONTAL_OPTIONS: ReadonlyArray<{ value: BackdropHorizontalFocus; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

const VERTICAL_OPTIONS: ReadonlyArray<{ value: BackdropVerticalFocus; label: string }> = [
  { value: "top", label: "Top" },
  { value: "center", label: "Centre" },
  { value: "bottom", label: "Bottom" },
];

const fileSize = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const SettingsAppearancePanel: React.FC = () => {
  const [backdrop, setBackdrop] = useState<BackdropFlag | null>(() => readBackdropFlag());
  const [storedUrl, setStoredUrl] = useState<string | null>(null);
  const storedUrlRef = useRef<string | null>(null);
  const [pending, setPending] = useState<PendingBackdrop | null>(null);
  const [previewSource, setPreviewSource] = useState<PreviewSource>(() => (readBackdropFlag() ? "custom" : "hub"));
  const [preferences, setPreferences] = useState<BackdropPreferences>(() => readBackdropPreferences());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshStoredBackdrop = async () => {
    const next = await loadBackdropUrl();
    if (storedUrlRef.current) URL.revokeObjectURL(storedUrlRef.current);
    storedUrlRef.current = next;
    setStoredUrl(next);
    setBackdrop(readBackdropFlag());
  };

  useEffect(() => {
    let live = true;
    void loadBackdropUrl().then((next) => {
      if (!live) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      storedUrlRef.current = next;
      setStoredUrl(next);
    });
    return () => {
      live = false;
      if (storedUrlRef.current) URL.revokeObjectURL(storedUrlRef.current);
    };
  }, []);

  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.url);
  }, [pending]);

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_BACKDROP_BYTES) {
      setError(`${file.name} is ${fileSize(file.size)}; the limit is 12 MB.`);
      return;
    }
    setPending({ file, url: URL.createObjectURL(file) });
    setPreviewSource("custom");
  };

  const applyPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      if (previewSource === "hub") {
        await clearBackdrop();
      } else if (pending) {
        await saveBackdrop(pending.file);
      }
      await refreshStoredBackdrop();
      setPending(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That image could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const updatePreferences = (patch: Partial<Omit<BackdropPreferences, "v">>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      return saveBackdropPreferences({
        horizontal: next.horizontal,
        vertical: next.vertical,
        shade: next.shade,
      });
    });
  };

  const resetFraming = () => {
    setPreferences(
      saveBackdropPreferences({
        horizontal: DEFAULT_BACKDROP_PREFERENCES.horizontal,
        vertical: DEFAULT_BACKDROP_PREFERENCES.vertical,
        shade: DEFAULT_BACKDROP_PREFERENCES.shade,
      }),
    );
  };

  const customUrl = pending?.url ?? storedUrl;
  const previewUrl = previewSource === "custom" && customUrl ? customUrl : "/bg/hub.jpg";
  const selectionChanged = previewSource === "hub" ? backdrop !== null : pending !== null;
  const previewName =
    previewSource === "hub" ? "Hub render" : pending?.file.name ?? backdrop?.name ?? "Uploaded image";

  return (
    <>
      <div id="appearance" className={PANEL}>
        <SectionHead
          title="Backdrop"
          right={
            <Tag accent className="max-w-64 truncate">
              {previewName}
            </Tag>
          }
        />
        <div className="settings-appearance-body">
          <div
            className="settings-backdrop-preview"
            style={{
              backgroundImage: `url("${previewUrl}")`,
              backgroundPosition: `${preferences.horizontal} ${preferences.vertical}`,
            }}
            role="img"
            aria-label={`Preview of ${previewSource === "hub" ? "the Hub render" : pending?.file.name ?? backdrop?.name ?? "uploaded image"}`}
          >
            <span
              className="settings-backdrop-preview-shade"
              style={{ backgroundColor: `rgb(7 8 10 / ${(preferences.shade / 100).toFixed(2)})` }}
            />
            <span className="settings-backdrop-preview-bar">
              <Wordmark size={17} />
              <span>Profile</span>
              <span>Crafting</span>
              <span>Forge</span>
            </span>
            <span className="settings-backdrop-preview-glass">
              <strong>Skydex</strong>
              <small>Preview the image, framing and shade together.</small>
            </span>
          </div>

          <div className="settings-backdrop-choices" aria-label="Backdrop image">
            <button
              type="button"
              className="settings-backdrop-choice"
              data-selected={previewSource === "hub" || undefined}
              aria-pressed={previewSource === "hub"}
              onClick={() => setPreviewSource("hub")}
            >
              <span style={{ backgroundImage: 'url("/bg/hub.jpg")' }} />
              <strong>Hub render</strong>
              <small>Built in</small>
              {previewSource === "hub" && <Check aria-hidden />}
            </button>

            <button
              type="button"
              className="settings-backdrop-choice"
              data-selected={previewSource === "custom" || undefined}
              aria-pressed={previewSource === "custom"}
              onClick={() => (customUrl ? setPreviewSource("custom") : inputRef.current?.click())}
            >
              <span
                className={customUrl ? "" : "settings-backdrop-choice-empty"}
                style={customUrl ? { backgroundImage: `url("${customUrl}")` } : undefined}
              >
                {!customUrl && <ImageIcon aria-hidden />}
              </span>
              <strong>{pending?.file.name ?? backdrop?.name ?? "Uploaded image"}</strong>
              <small>{pending ? "Ready to apply" : backdrop ? fileSize(backdrop.size) : "Choose a file"}</small>
              {previewSource === "custom" && <Check aria-hidden />}
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div className="settings-appearance-actions">
            <button type="button" className={BTN_QUIET} onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload className="h-3 w-3" aria-hidden />
              {backdrop || pending ? "Choose another image" : "Choose an image"}
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void applyPreview()} disabled={busy || !selectionChanged}>
              {busy ? "Applying…" : previewSource === "hub" ? "Use Hub render" : "Use this image"}
            </button>
            {pending && <span>{pending.file.name} · {fileSize(pending.file.size)}</span>}
          </div>

          <ControlGrid className="settings-backdrop-controls">
            <ControlRow label="Horizontal focus">
              <Segmented
                options={HORIZONTAL_OPTIONS}
                value={preferences.horizontal}
                onChange={(horizontal) => updatePreferences({ horizontal })}
                ariaLabel="Horizontal image focus"
              />
            </ControlRow>
            <ControlRow label="Vertical focus">
              <Segmented
                options={VERTICAL_OPTIONS}
                value={preferences.vertical}
                onChange={(vertical) => updatePreferences({ vertical })}
                ariaLabel="Vertical image focus"
              />
            </ControlRow>
            <SliderRow
              id="settings-backdrop-shade"
              label="Image shade"
              min={8}
              max={40}
              value={preferences.shade}
              format={(value) => `${value}%`}
              onChange={(shade) => updatePreferences({ shade })}
              hint="Darkens the image behind Skydex without changing the image itself."
            />
          </ControlGrid>

          <button type="button" className={BTN_QUIET} onClick={resetFraming}>
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset framing
          </button>
          {error && <p className="settings-appearance-error">{error}</p>}
        </div>
      </div>

      <div id="texture-pack">
        <TexturePackPanel compact />
      </div>
    </>
  );
};

export default SettingsAppearancePanel;
