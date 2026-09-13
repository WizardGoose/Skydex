import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const revision = '7adf1a88b90b9ad1aeb45fa49087cdfc6694cb9f';
const base = `https://raw.githubusercontent.com/Campionnn/SkyShards/${revision}/`;
const root = process.cwd();
const cache = resolve(root, '.vite/shard-catalogue-update', revision);
const apply = process.argv.includes('--write');
mkdirSync(cache, { recursive: true });
async function source(path) {
  const file = resolve(cache, path.replaceAll('/', '__'));
  if (!existsSync(file)) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(file);
}
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const [fusion, descriptions, properties, rates] = await Promise.all(
  ['public/fusion-data.json', 'src/desc.json', 'public/fusion-properties.json', 'public/rates.json']
    .map(async path => JSON.parse((await source(path)).toString())),
);
const old = json('public/fusion-data.json');
const oldDescriptions = json('src/desc.json');
const keyMap = {};
const used = new Set();
// Internal keys are persisted in targets, reserves and inventory. Match attributes,
// not display names: several existing attributes moved to differently named mobs.
for (const [key] of Object.entries(old.shards)) {
  const attribute = oldDescriptions[key]?.id;
  const matches = Object.keys(fusion.shards).filter(id => descriptions[id]?.id === attribute);
  if (matches.length !== 1) throw new Error(`Cannot preserve ${key}/${attribute}: ${matches}`);
  keyMap[matches[0]] = key;
  used.add(key);
}
for (const key of Object.keys(fusion.shards)) {
  if (keyMap[key]) continue;
  if (!used.has(key)) { keyMap[key] = key; used.add(key); }
}
for (const key of Object.keys(fusion.shards)) {
  if (keyMap[key]) continue;
  const free = Object.keys(fusion.shards).find(candidate => candidate[0] === key[0] && !used.has(candidate));
  if (!free) throw new Error(`No free internal key for ${key}`);
  keyMap[key] = free; used.add(free);
}
const mapped = object => Object.fromEntries(Object.entries(object).map(([key,value]) => {
  if (!keyMap[key]) throw new Error(`Unknown upstream key ${key}`);
  return [keyMap[key], value];
}));
const nextFusion = { shards: mapped(fusion.shards), recipes: {} };
for (const [output, groups] of Object.entries(fusion.recipes)) {
  nextFusion.recipes[keyMap[output]] = Object.fromEntries(Object.entries(groups).map(([quantity, pairs]) =>
    [quantity, pairs.map(pair => pair.map(id => {
      if (!keyMap[id]) throw new Error(`Unknown recipe input ${id}`);
      return keyMap[id];
    }))]));
}
const plain = value => Array.isArray(value) ? value.map(plain).join('') : typeof value === 'string' ? value
  : value?.t ?? (value?.range ? `${(value.range[0] ?? value.range[1]) >= 0 ? '+' : ''}${value.range[0] ?? value.range[1]}${value.unit ?? ''}` : '');
const nextDescriptions = {};
const acquisition = {};
const presentation = {};
for (const [upstreamKey, localKey] of Object.entries(keyMap)) {
  const desc = descriptions[upstreamKey];
  if (!desc?.id || !desc.title) throw new Error(`Missing description ${upstreamKey}`);
  nextDescriptions[localKey] = { title: desc.title, id: desc.id, description: plain(desc.description).trim() };
  acquisition[localKey] = (desc.how_to_hunt ?? []).map(line => plain(line).replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  presentation[localKey] = { description: desc.description, how_to_hunt: desc.how_to_hunt ?? [] };
}
console.log(JSON.stringify({revision, oldCount:Object.keys(old.shards).length, newCount:Object.keys(fusion.shards).length,
  remapped:Object.entries(keyMap).filter(([a,b])=>a!==b), missingRates:Object.keys(fusion.shards).filter(k=>!(k in rates)),
  changes:Object.keys(old.shards).filter(k=>JSON.stringify(old.shards[k])!==JSON.stringify(nextFusion.shards[k])).length}, null, 2));
if (apply) {
  // Stage every image before replacing any live dataset.
  const images = new Map();
  const pending = Object.entries(keyMap);
  await Promise.all(Array.from({length:6}, async () => {
    while (pending.length) {
      const [key,localKey] = pending.shift();
      const icon = await source(`public/shardIcons/${key}.png`);
      if (!icon.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error(`Invalid icon ${key}`);
      images.set(localKey,icon);
    }
  }));
  const outputs = {'public/fusion-data.json':nextFusion, 'public/fusion-properties.json':mapped(properties),
    'public/rates.json':mapped(rates), 'src/desc.json':nextDescriptions,
    'src/shards/acquisitionData.generated.json':acquisition, 'src/shards/shardPresentation.generated.json':presentation,
    'src/shards/catalogueRevision.generated.json':{revision, upstreamKeyToLocalKey:keyMap}};
  for (const [path,value] of Object.entries(outputs)) writeFileSync(resolve(root,path), JSON.stringify(value,null,2)+'\n');
  for (const [localKey,icon] of images) {
    writeFileSync(resolve(root, `public/shardIcons/${localKey}.png`), icon);
  }
}
