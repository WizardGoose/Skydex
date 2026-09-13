export interface AlternativeDisplayOption {
  id: string;
  name: string;
}

const words = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);

const commonSuffix = (options: readonly AlternativeDisplayOption[]): string[] => {
  if (options.length === 0) return [];
  const first = words(options[0].name);
  const suffix: string[] = [];
  for (let offset = 1; offset <= first.length; offset += 1) {
    const expected = first[first.length - offset].toLowerCase();
    if (!options.every((option) => {
      const parts = words(option.name);
      return parts.length >= offset && parts[parts.length - offset].toLowerCase() === expected;
    })) break;
    suffix.unshift(first[first.length - offset]);
  }
  return suffix;
};

/**
 * Alternative ingredients are one interchangeable requirement. Their display
 * name therefore describes the shared group, while the linked article remains
 * the primary source item. A common trailing material word keeps this generic:
 * Oak/Birch Planks becomes "Planks (any type)", while an irregular group still
 * honestly says "Primary (any type)" instead of pretending the variants add.
 */
export const alternativeGroupLabel = (
  primary: AlternativeDisplayOption,
  alternatives: readonly AlternativeDisplayOption[]
): string => {
  const options = [primary, ...alternatives];
  const suffix = commonSuffix(options);
  const group = suffix.length > 0 ? suffix.join(" ") : primary.name;
  const pluralGroup = suffix.length === 0 || /(?:s|x|z|ch|sh)$/i.test(group) ? group : `${group}s`;
  return pluralGroup + " (any type)";
};

export const alternativeDisplayOptions = (
  primary: AlternativeDisplayOption,
  alternatives: readonly AlternativeDisplayOption[]
): AlternativeDisplayOption[] => {
  const seen = new Set<string>();
  return [primary, ...alternatives].filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
};
