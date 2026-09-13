import PRESENTATION from "./shardPresentation.generated.json";

interface TextSegment {
  t?: string;
  c?: string;
  bold?: boolean;
  range?: [number | null, number];
  unit?: string;
}

interface ShardPresentation {
  description: TextSegment[];
  how_to_hunt: TextSegment[][];
}

const presentation = PRESENTATION as Record<string, ShardPresentation | null>;

const GAME_COLOR_CODE: Readonly<Record<string, string>> = {
  black: "0",
  dark_blue: "1",
  dark_green: "2",
  dark_aqua: "3",
  dark_red: "4",
  dark_purple: "5",
  gold: "6",
  gray: "7",
  dark_gray: "8",
  blue: "9",
  green: "a",
  aqua: "b",
  red: "c",
  light_purple: "d",
  yellow: "e",
  white: "f",
};

const rangeText = (segment: TextSegment, fallback: string): string => {
  const value = segment.range?.[0] ?? segment.range?.[1];
  if (value === null || value === undefined) return "?";
  const base = `${value}${segment.unit ?? ""}`;
  return value >= 0 && fallback.includes(`+${base}`) ? `+${base}` : base;
};

const segmentText = (segment: TextSegment, fallback: string): string =>
  Array.isArray(segment.range) ? rangeText(segment, fallback) : segment.t ?? "";

const gameLine = (segments: readonly TextSegment[], fallback: string): string => segments
  .map((segment, index) => {
    const colour = GAME_COLOR_CODE[segment.c?.trim().toLowerCase() ?? "gray"] ?? GAME_COLOR_CODE.gray;
    const separator = segment.range && /^[A-Za-z]/.test(segments[index + 1]?.t ?? "") ? " " : "";
    return `§${colour}${segment.bold ? "§l" : ""}${segmentText(segment, fallback)}${separator}`;
  })
  .join("");

const normalLine = (value: string): string => value
  .replace(/^\s*-\s*/, "")
  .replace(/\s+/g, " ")
  .trim();

export const shardDescriptionGameText = (shardKey: string, fallback: string): string | null => {
  const segments = presentation[shardKey]?.description;
  return segments?.length ? gameLine(segments, fallback) : null;
};

export const shardAcquisitionGameText = (shardKey: string, fallback: string): string | null => {
  if (shardKey === "R88" && fallback.includes("Pangolin Hideaways")) {
    return `§7${fallback.replace(/Pangolin Hideaways|Torrhus Canyon/g, "§3$&§7")}`;
  }
  const lines = presentation[shardKey]?.how_to_hunt ?? [];
  if (lines.length === 0) return null;
  const wanted = normalLine(fallback);
  const selected = lines.find((line) => normalLine(line.map((segment) => segmentText(segment, fallback)).join("")) === wanted);
  if (!selected) return null;
  return gameLine(selected, fallback).replace(/^(?:(?:§[0-9a-f])|\s)*-(?:(?:§[0-9a-f])|\s)*/i, "");
};

/** Attribute groups follow the same game colours already present in the exported shard lore. */
export const shardTypeGameText = (type: string): string => {
  const colour = {
    combat: "c",
    fishing: "b",
    foraging: "2",
    farming: "6",
    mining: "6",
    enchanting: "3",
    taming: "d",
    hunting: "d",
    global: "f",
  }[type.trim().toLowerCase()] ?? "7";
  return `§${colour}${type}`;
};
