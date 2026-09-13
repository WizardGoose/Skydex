import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "data/wiki/modules/Module_Pet_Data.lua");
const outputPath = resolve(root, "src/profile/petStats.generated.ts");
const source = readFileSync(sourcePath, "utf8");

const tokens = [];
let cursor = 0;

const escaped = { n: "\n", r: "\r", t: "\t" };
while (cursor < source.length) {
  const char = source[cursor];
  if (/\s/.test(char)) {
    cursor += 1;
    continue;
  }
  if (char === "-" && source[cursor + 1] === "-") {
    cursor = source.indexOf("\n", cursor + 2);
    if (cursor < 0) break;
    continue;
  }
  if (char === "'" || char === '"') {
    const quote = char;
    let value = "";
    cursor += 1;
    while (cursor < source.length && source[cursor] !== quote) {
      if (source[cursor] === "\\" && cursor + 1 < source.length) {
        cursor += 1;
        value += escaped[source[cursor]] ?? source[cursor];
      } else {
        value += source[cursor];
      }
      cursor += 1;
    }
    if (source[cursor] !== quote) throw new Error("Unterminated Lua string");
    cursor += 1;
    tokens.push({ type: "string", value });
    continue;
  }
  const number = source.slice(cursor).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
  if (number) {
    tokens.push({ type: "number", value: Number(number[0]) });
    cursor += number[0].length;
    continue;
  }
  const identifier = source.slice(cursor).match(/^[A-Za-z_][A-Za-z0-9_]*/);
  if (identifier) {
    tokens.push({ type: "identifier", value: identifier[0] });
    cursor += identifier[0].length;
    continue;
  }
  if ("{}[]=,;".includes(char)) {
    tokens.push({ type: char, value: char });
    cursor += 1;
    continue;
  }
  throw new Error(`Unsupported Lua token ${JSON.stringify(char)} at ${cursor}`);
}

let position = tokens.findIndex((token) => token.type === "identifier" && token.value === "return") + 1;
if (position === 0) throw new Error("Pet data did not return a table");

const peek = (offset = 0) => tokens[position + offset];
const consume = (type) => {
  const token = tokens[position];
  if (!token || token.type !== type) throw new Error(`Expected ${type}, received ${token?.type ?? "EOF"}`);
  position += 1;
  return token;
};

const table = () => ({ fields: new Map(), array: [] });

const parseValue = () => {
  const token = peek();
  if (!token) throw new Error("Unexpected end of Lua data");
  if (token.type === "{") return parseTable();
  position += 1;
  if (token.type === "string" || token.type === "number") return token.value;
  if (token.type === "identifier") {
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (token.value === "nil") return null;
    return token.value;
  }
  throw new Error(`Unsupported Lua value ${token.type}`);
};

const parseTable = () => {
  consume("{");
  const result = table();
  while (peek()?.type !== "}") {
    let key = null;
    if (peek()?.type === "[") {
      consume("[");
      key = parseValue();
      consume("]");
      consume("=");
    } else if (peek()?.type === "identifier" && peek(1)?.type === "=") {
      key = consume("identifier").value;
      consume("=");
    }
    const value = parseValue();
    if (key === null) result.array.push(value);
    else result.fields.set(String(key), value);
    if (peek()?.type === "," || peek()?.type === ";") position += 1;
  }
  consume("}");
  return result;
};

const rootTable = parseValue();
const isTable = (value) => value && typeof value === "object" && value.fields instanceof Map;
if (!isTable(rootTable)) throw new Error("Pet data root was not a table");

const statRows = (value) => {
  if (!isTable(value)) return [];
  return value.array.flatMap((row) => {
    if (!isTable(row)) return [];
    const name = row.fields.get("name");
    const base = row.fields.get("base") ?? 0;
    const perLevel = row.fields.get("bonus") ?? 0;
    if (typeof name !== "string" || typeof base !== "number" || typeof perLevel !== "number") return [];
    if (base === 0 && perLevel === 0) return [];
    return [{ name, base, perLevel }];
  });
};

const numberedStringRows = (value) => {
  if (!isTable(value)) return new Map();
  return new Map([...value.fields.entries()].flatMap(([key, row]) => (
    /^\d+$/.test(key) && typeof row === "string" ? [[Number(key), row]] : []
  )));
};

const abilityRows = (value) => {
  if (!isTable(value)) return [];
  const names = numberedStringRows(value.fields.get("name"));
  const tooltips = numberedStringRows(value.fields.get("tooltip"));
  return [...names.entries()]
    .flatMap(([index, name]) => {
      const description = tooltips.get(index);
      return typeof description === "string" ? [{ index, name, description }] : [];
    })
    .sort((left, right) => left.index - right.index);
};

const abilityTierRows = (value) => {
  if (!isTable(value)) return {};
  const tiers = {};
  for (const [tier, tierValue] of value.fields) {
    if (!isTable(tierValue)) continue;
    const explicitIndices = tierValue.fields.get("ability_indices");
    const abilityCount = tierValue.fields.get("ability_count");
    const indices = isTable(explicitIndices)
      ? explicitIndices.array.filter((index) => typeof index === "number" && Number.isInteger(index) && index > 0)
      : typeof abilityCount === "number" && Number.isInteger(abilityCount) && abilityCount > 0
        ? Array.from({ length: abilityCount }, (_, index) => index + 1)
        : [];
    if (indices.length === 0) continue;

    const variables = {};
    for (const [key, variable] of tierValue.fields) {
      if (!/^\d+$/.test(key) || !isTable(variable)) continue;
      const base = variable.fields.get("base") ?? 0;
      const perLevel = variable.fields.get("per_lvl") ?? 0;
      if (typeof base !== "number" || typeof perLevel !== "number") continue;
      variables[key] = {
        base,
        perLevel,
        roundDown: variable.fields.get("round_down") === true,
        eval: typeof variable.fields.get("eval") === "string" ? variable.fields.get("eval") : null,
      };
    }
    tiers[tier.toUpperCase()] = { indices, variables };
  }
  return tiers;
};

const definitions = {};
for (const pet of rootTable.fields.values()) {
  if (!isTable(pet)) continue;
  const id = pet.fields.get("id");
  if (typeof id !== "string" || !id) continue;
  const base = statRows(pet.fields.get("stats"));
  const byTier = {};
  const variables = pet.fields.get("variables");
  if (isTable(variables)) {
    for (const [tier, tierValue] of variables.fields) {
      if (!isTable(tierValue)) continue;
      const rows = statRows(tierValue.fields.get("stats"));
      if (rows.length > 0) byTier[tier.toUpperCase()] = rows;
    }
  }
  const abilities = abilityRows(pet.fields.get("abilities"));
  const abilitiesByTier = abilityTierRows(variables);
  if (base.length === 0 && Object.keys(byTier).length === 0 && abilities.length === 0) continue;
  definitions[id.toUpperCase()] = {
    petType: typeof pet.fields.get("petType") === "string" ? pet.fields.get("petType") : null,
    base,
    byTier,
    abilities,
    abilitiesByTier,
  };
}

const generated = `/* Generated from data/wiki/modules/Module_Pet_Data.lua by tools/build-pet-stats.mjs. */
export interface PetStatDefinition {
  name: string;
  base: number;
  perLevel: number;
}

export interface PetAbilityDefinition {
  index: number;
  name: string;
  description: string;
}

export interface PetAbilityVariableDefinition {
  base: number;
  perLevel: number;
  roundDown: boolean;
  eval: string | null;
}

export interface PetAbilityTierDefinition {
  indices: readonly number[];
  variables: Readonly<Record<string, PetAbilityVariableDefinition>>;
}

export interface PetStatDefinitionSet {
  petType: string | null;
  base: readonly PetStatDefinition[];
  byTier: Readonly<Record<string, readonly PetStatDefinition[]>>;
  abilities: readonly PetAbilityDefinition[];
  abilitiesByTier: Readonly<Record<string, PetAbilityTierDefinition>>;
}

export const PET_STAT_DEFINITIONS: Readonly<Record<string, PetStatDefinitionSet>> = ${JSON.stringify(definitions, null, 2)};
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== generated) throw new Error("petStats.generated.ts is stale");
} else {
  writeFileSync(outputPath, generated, "utf8");
  console.log(`Wrote ${Object.keys(definitions).length} pet stat definitions.`);
}
