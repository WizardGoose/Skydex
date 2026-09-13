import { useSyncExternalStore } from "react";
import type { DerivedHunterFortune, KuudraTier } from "./profileAssumptions";

export interface ShardProfileSnapshot {
  profileId: string;
  profileName: string;
  fetchedAt: number;
  hunterFortune: DerivedHunterFortune;
  kuudraTier: KuudraTier | null;
}

const STORAGE_KEY = "skydex.shards.profile-assumptions.v1";
let hydrated = false;
let snapshot: ShardProfileSnapshot | null = null;
const listeners = new Set<() => void>();

const hydrate = () => {
  if (hydrated || typeof localStorage === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) snapshot = JSON.parse(raw) as ShardProfileSnapshot;
  } catch {
    snapshot = null;
  }
};

const getSnapshot = () => {
  hydrate();
  return snapshot;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishShardProfileSnapshot = (next: ShardProfileSnapshot | null) => {
  hydrated = true;
  snapshot = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The live in-memory snapshot still serves this visit.
  }
  for (const listener of listeners) listener();
};

export const useShardProfileSnapshot = (): ShardProfileSnapshot | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const shardProfileSnapshotStore = { getSnapshot, subscribe };
