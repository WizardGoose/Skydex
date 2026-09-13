import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Edit2, FolderOpen, Save, Search, Share2, Trash2, X } from "lucide-react";
import type { SavedLayout } from "../../types/layout";
import { FOCUS } from "../../../ui/kit";
import { DesignerLayoutPreview } from "./DesignerLayoutPreview";
import { mostRecentLayoutName } from "./layoutPreviewPresentation";

interface LoadLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (layout: SavedLayout) => void;
  onLoadMostRecent: () => void;
  onDelete: (layoutId: string) => void;
  onRename: (layoutId: string, newName: string) => void;
  onShare: (layout: SavedLayout, displayName: string) => void;
  layouts: SavedLayout[];
  mostRecentLayout: SavedLayout | null;
  title?: string;
  saveCurrent?: {
    name: string;
    onNameChange: (name: string) => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
    disabled: boolean;
    summary: string;
  };
}

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

interface LayoutCardActionButtonsProps {
  onLoad: () => void;
  onShare: () => void;
  onDelete?: () => void;
  onDeleteBlur?: () => void;
  showDeleteConfirm?: boolean;
}

export const LayoutCardActionButtons = ({
  onLoad,
  onShare,
  onDelete,
  onDeleteBlur,
  showDeleteConfirm = false,
}: LayoutCardActionButtonsProps) => (
  <>
    <button
      type="button"
      aria-label="Load layout"
      onClick={onLoad}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-[12px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30 sm:flex-none ${FOCUS}`}
    >
      <FolderOpen className="h-4 w-4" />
      Load layout
    </button>
    <button
      type="button"
      aria-label="Share layout"
      onClick={onShare}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-800/70 px-4 py-2 text-[12px] font-medium text-slate-300 transition-colors hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-200 sm:flex-none ${FOCUS}`}
    >
      <Share2 className="h-4 w-4" />
      Share layout
    </button>
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        onBlur={onDeleteBlur}
        title={showDeleteConfirm ? "Select again to delete" : "Delete layout"}
        className={`cursor-pointer rounded-md border px-3 py-2 text-[12px] transition-colors ${FOCUS} ${
          showDeleteConfirm
            ? "border-red-500/50 bg-red-500/20 text-red-200"
            : "border-slate-600 bg-slate-800/70 text-slate-400 hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-300"
        }`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    )}
  </>
);

const LayoutCard: React.FC<{
  layout: SavedLayout;
  onLoad: () => void;
  onShare: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
  isMostRecent?: boolean;
  displayName?: string;
}> = ({ layout, onLoad, onShare, onDelete, onRename, isMostRecent = false, displayName }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(layout.name);
  const [renameError, setRenameError] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  useEffect(() => {
    setRenameValue(layout.name);
  }, [layout.name]);

  const handleRenameSubmit = () => {
    if (!onRename) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Enter a layout name.");
      return;
    }
    if (trimmed !== layout.name) onRename(trimmed);
    setRenameValue(trimmed || layout.name);
    setRenameError("");
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setRenameValue(layout.name);
    setRenameError("");
    setIsRenaming(false);
  };

  const handleDelete = () => {
    if (!onDelete) return;
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    onDelete();
  };

  return (
    <article className="overflow-hidden rounded-md border border-white/12 bg-slate-900/45 transition-colors hover:border-white/20">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-4">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <form
              className="flex max-w-md items-start gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleRenameSubmit();
              }}
            >
              <div className="min-w-0 flex-1">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    setRenameError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  className={`w-full rounded-md border px-2 py-1 text-[13px] text-slate-100 ${
                    renameError ? "border-red-500/60 bg-red-500/5" : "border-slate-600 bg-slate-800/80"
                  } ${FOCUS}`}
                  maxLength={50}
                  aria-label="Layout name"
                />
                {renameError && <p className="mt-1 text-[11px] text-red-400">{renameError}</p>}
              </div>
              <button
                type="submit"
                title="Save name"
                className={`cursor-pointer rounded-md p-1.5 text-emerald-300 transition-colors hover:bg-emerald-500/10 ${FOCUS}`}
              >
                <Check className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[14px] font-semibold text-slate-100">{displayName ?? layout.name}</h3>
              {onRename && (
                <button
                  type="button"
                  onClick={() => setIsRenaming(true)}
                  title="Rename layout"
                  className={`cursor-pointer rounded-md p-1 text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-200 ${FOCUS}`}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {isMostRecent ? "Updated" : "Saved"} {formatDate(layout.savedAt)}
            {!isMostRecent && layout.modifiedAt !== layout.savedAt && ` · Modified ${formatDate(layout.modifiedAt)}`}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
          {layout.targets.length} target{layout.targets.length === 1 ? "" : "s"} · {layout.inputs.length} input{layout.inputs.length === 1 ? "" : "s"}
        </span>
      </div>

      <DesignerLayoutPreview layout={layout} compact className="p-3 sm:p-4" />

      <div className="flex gap-2 border-t border-white/10 bg-black/10 px-3 py-2.5 sm:justify-end sm:px-4">
        <LayoutCardActionButtons
          onLoad={onLoad}
          onShare={onShare}
          onDelete={onDelete ? handleDelete : undefined}
          onDeleteBlur={() => setShowDeleteConfirm(false)}
          showDeleteConfirm={showDeleteConfirm}
        />
      </div>
    </article>
  );
};

export const LoadLayoutModal: React.FC<LoadLayoutModalProps> = ({
  isOpen,
  onClose,
  onLoad,
  onLoadMostRecent,
  onDelete,
  onRename,
  onShare,
  layouts,
  mostRecentLayout,
  title = "Load layout",
  saveCurrent,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"saved" | "name">("saved");

  useEffect(() => {
    if (!isOpen) setSearchTerm("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen, onClose]);

  const filteredAndSortedLayouts = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase();
    const filtered = search ? layouts.filter((layout) => layout.name.toLocaleLowerCase().includes(search)) : layouts;
    return [...filtered].sort((left, right) =>
      sortBy === "name" ? left.name.localeCompare(right.name) : right.savedAt - left.savedAt,
    );
  }, [layouts, searchTerm, sortBy]);

  if (!isOpen) return null;

  const recentName = mostRecentLayout
    ? mostRecentLayoutName(mostRecentLayout, layouts)
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-layout-title"
        className="sd-lip my-auto flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-emerald-300" />
            <h2 id="load-layout-title" className="text-lg font-semibold text-slate-50">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`cursor-pointer rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-100 ${FOCUS}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {saveCurrent && (
          <form
            className="grid shrink-0 gap-2 border-b border-slate-700/70 bg-black/10 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={saveCurrent.onSubmit}
          >
            <label className="grid min-w-0 gap-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                <Save className="h-3.5 w-3.5" /> Save current plot
              </span>
              <input
                value={saveCurrent.name}
                onChange={(event) => saveCurrent.onNameChange(event.target.value)}
                placeholder="Loadout name"
                aria-label="Name this greenhouse loadout"
                className={`h-9 w-full rounded-md border border-slate-600/60 bg-slate-800/70 px-3 text-[12px] text-slate-100 placeholder:text-slate-500 ${FOCUS}`}
              />
              <small className="text-[11px] text-slate-500">{saveCurrent.summary}</small>
            </label>
            <button
              type="submit"
              disabled={saveCurrent.disabled}
              className={`h-9 cursor-pointer rounded-md border border-cyan-400/35 bg-cyan-400/10 px-4 text-[12px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/16 disabled:cursor-default disabled:opacity-35 ${FOCUS}`}
            >
              Save
            </button>
          </form>
        )}

        <div className="shrink-0 border-b border-slate-700/70 px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search saved layouts"
                className={`w-full rounded-md border border-slate-600/60 bg-slate-800/70 py-2 pl-9 pr-3 text-[12px] text-slate-100 placeholder:text-slate-500 ${FOCUS}`}
              />
            </div>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value === "name" ? "name" : "saved")}
              aria-label="Sort saved layouts"
              className={`cursor-pointer rounded-md border border-slate-600/60 bg-slate-800/70 px-3 py-2 text-[12px] text-slate-200 ${FOCUS}`}
            >
              <option value="saved">Newest saved</option>
              <option value="name">Name</option>
            </select>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {filteredAndSortedLayouts.length} saved layout{filteredAndSortedLayouts.length === 1 ? "" : "s"}
            {searchTerm.trim() ? ` matching “${searchTerm.trim()}”` : ""}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {mostRecentLayout || filteredAndSortedLayouts.length > 0 ? (
            <div className="space-y-3">
              {mostRecentLayout && (
                <LayoutCard
                  layout={mostRecentLayout}
                  displayName={`Most Recent (${recentName})`}
                  onLoad={onLoadMostRecent}
                  onShare={() => onShare(mostRecentLayout, recentName!)}
                  isMostRecent
                />
              )}
              {filteredAndSortedLayouts.map((layout) => (
                <LayoutCard
                  key={layout.id}
                  layout={layout}
                  onLoad={() => onLoad(layout)}
                  onShare={() => onShare(layout, layout.name)}
                  onDelete={() => onDelete(layout.id)}
                  onRename={(newName) => onRename(layout.id, newName)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <FolderOpen className="h-8 w-8 text-slate-600" />
              <p className="text-[12px] font-medium text-slate-300">
                {searchTerm.trim() ? "No saved layouts match that search" : "No saved layouts yet"}
              </p>
              {!searchTerm.trim() && <p className="text-[11px] text-slate-500">Save the current design to keep it here.</p>}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-700 bg-slate-900 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className={`cursor-pointer rounded-md border border-slate-600 bg-slate-800/70 px-4 py-2 text-[12px] font-medium text-slate-300 transition-colors hover:bg-slate-700 ${FOCUS}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
