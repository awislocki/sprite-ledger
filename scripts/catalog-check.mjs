// Master-list check: diff the live fortnite-api Sprite Mastery Pod against
// our committed catalog (lib/catalog.js) and report what's new or changed.
// Run occasionally (Fortnite updates ~weekly), NOT per request:
//   npm run catalog:check          report only
//   npm run catalog:check -- --write   also write a suggested catalog block
//
// Note: licensed collab sprites (e.g. Batman, Vini Jr) award their OWN
// backbling and are NOT variants of this pod, so they won't appear here —
// those come from a live sync report + local asset extraction.

import { readFileSync, writeFileSync } from "node:fs";
import { SPRITES, VARIANT_ORDER } from "../lib/catalog.js";

const API =
  "https://fortnite-api.com/v2/cosmetics/br/search/all?matchMethod=contains&id=coldtrophy";
const VARIANT_WORDS = ["Gold", "Gummy", "Galaxy", "Gem", "Holofoil", "Cube", "Quack"];

async function fetchPod() {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`fortnite-api ${res.status}`);
  const { data } = await res.json();
  const pod = (data || []).find((c) => /coldtrophy/i.test(c.id));
  if (!pod) throw new Error("ColdTrophy pod not found in fortnite-api response");
  const mesh = (pod.variants || []).find((v) => v.channel === "Mesh");
  if (!mesh) throw new Error("pod has no Mesh variant channel");
  return mesh.options;
}

// options → { spriteName: { variantKey: fileTag } }
function parseSprites(options) {
  const sprites = {};
  for (const o of options) {
    const m = o.image.match(/variants\/mesh\/([a-z0-9]+)\.png$/i);
    if (!m || /mat0$/i.test(o.tag)) continue; // empty pod
    const file = m[1];
    let name = o.name.replace(/ Sprite$/i, "").trim();
    if (/mastery pod/i.test(name)) continue;
    let variant = "Normal";
    for (const w of VARIANT_WORDS)
      if (name.startsWith(w + " ")) {
        variant = w;
        name = name.slice(w.length + 1);
        break;
      }
    (sprites[name] ||= {})[variant] = file;
  }
  return sprites;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function catalogByName() {
  const byName = {};
  for (const s of SPRITES) byName[norm(s.name)] = s;
  return byName;
}

function suggestEntry(name, variants) {
  const slug = norm(name);
  const vs = VARIANT_ORDER.filter((v) => variants[v])
    .map((v) => `${v}: "${variants[v]}"`)
    .join(", ");
  return `  { slug: "${slug}", name: "${name}", element: "other", aliases: [],\n    variants: { ${vs} } },`;
}

const live = parseSprites(await fetchPod());
const known = catalogByName();

const newSprites = [];
const changed = [];
for (const [name, variants] of Object.entries(live)) {
  const entry = known[norm(name)];
  if (!entry) {
    newSprites.push([name, variants]);
    continue;
  }
  const liveVars = new Set(Object.keys(variants));
  const ourVars = new Set(Object.keys(entry.variants));
  const added = [...liveVars].filter((v) => !ourVars.has(v));
  const removed = [...ourVars].filter((v) => !liveVars.has(v));
  const remapped = [...liveVars].filter(
    (v) => ourVars.has(v) && entry.variants[v] !== variants[v]
  );
  if (added.length || removed.length || remapped.length)
    changed.push({ name, added, removed, remapped });
}
const goneSprites = Object.keys(known).filter((k) => !live[Object.keys(live).find((n) => norm(n) === k)]);

console.log(`Live pod: ${Object.keys(live).length} sprites · Catalog: ${SPRITES.length} sprites\n`);

if (!newSprites.length && !changed.length && !goneSprites.length) {
  console.log("✓ Catalog matches the live Sprite Mastery Pod. Nothing to do.");
} else {
  if (newSprites.length) {
    console.log(`NEW sprites (${newSprites.length}) — add to lib/catalog.js SPRITES:`);
    for (const [name, variants] of newSprites) console.log(suggestEntry(name, variants));
    console.log("  (set `element` and `aliases` by hand.)\n");
  }
  if (changed.length) {
    console.log("CHANGED variant sets:");
    for (const c of changed)
      console.log(
        `  ${c.name}:` +
          (c.added.length ? ` +[${c.added}]` : "") +
          (c.removed.length ? ` -[${c.removed}]` : "") +
          (c.remapped.length ? ` remap[${c.remapped}]` : "")
      );
    console.log();
  }
  if (goneSprites.length)
    console.log(`GONE from live (kept in catalog): ${goneSprites.join(", ")}\n`);
}

if (process.argv.includes("--write") && newSprites.length) {
  const block = newSprites.map(([n, v]) => suggestEntry(n, v)).join("\n");
  writeFileSync("catalog-additions.txt", block + "\n");
  console.log("Wrote suggested entries to catalog-additions.txt for review.");
}
