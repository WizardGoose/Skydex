export interface ChestDisclosureState {
  openByDefault: boolean;
  exceptions: ReadonlySet<string>;
}

interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_DISCLOSURE_PREFIX = "skydex.storage.chest-disclosures.v1";

export const defaultChestDisclosureState = (): ChestDisclosureState => ({
  openByDefault: true,
  exceptions: new Set<string>(),
});

const disclosureKey = (scope: string): string =>
  `${STORAGE_DISCLOSURE_PREFIX}.${encodeURIComponent(scope.trim() || "anonymous")}`;

const browserStorage = (): StoragePort | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const readChestDisclosureState = (
  scope: string,
  storage: StoragePort | null = browserStorage(),
): ChestDisclosureState => {
  if (!storage) return defaultChestDisclosureState();

  try {
    const raw = storage.getItem(disclosureKey(scope));
    if (!raw) return defaultChestDisclosureState();
    const parsed = JSON.parse(raw) as { openByDefault?: unknown; exceptions?: unknown };
    if (typeof parsed.openByDefault !== "boolean" || !Array.isArray(parsed.exceptions)) {
      return defaultChestDisclosureState();
    }
    return {
      openByDefault: parsed.openByDefault,
      exceptions: new Set(parsed.exceptions.filter((entry): entry is string => typeof entry === "string")),
    };
  } catch {
    return defaultChestDisclosureState();
  }
};

export const writeChestDisclosureState = (
  scope: string,
  state: ChestDisclosureState,
  storage: StoragePort | null = browserStorage(),
): void => {
  if (!storage) return;
  try {
    storage.setItem(disclosureKey(scope), JSON.stringify({
      openByDefault: state.openByDefault,
      exceptions: [...state.exceptions].sort(),
    }));
  } catch {
    // Storage can be unavailable or full. The in-memory disclosure still works.
  }
};

export const chestIsExpanded = (state: ChestDisclosureState, chest: string): boolean =>
  state.exceptions.has(chest) ? !state.openByDefault : state.openByDefault;

export const toggleChestDisclosure = (
  state: ChestDisclosureState,
  chest: string,
): ChestDisclosureState => {
  const exceptions = new Set(state.exceptions);
  if (exceptions.has(chest)) exceptions.delete(chest);
  else exceptions.add(chest);
  return { ...state, exceptions };
};
