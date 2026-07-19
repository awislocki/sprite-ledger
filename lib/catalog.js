// Seed catalog for Chapter 7 Season 3 Sprites.
// Names compiled from community sources (July 2026) — Epic doesn't publish an
// official list, so treat this as editable. Synced items that don't match a
// catalog entry show up in the "Unmapped from sync" section; add them here
// (name + match keywords) and they'll slot into the grid.
//
// element: fire | water | earth | mythic | other  (drives card accent)
// match: lowercase substrings tested against synced templateIds.

export const VARIANTS = ["Normal", "Gold", "Gummy", "Galaxy", "Gem", "Holofoil"];

export const CATALOG = [
  { id: "fire",     name: "Fire",        element: "fire",   tier: "Rare",   match: ["fire"] },
  { id: "water",    name: "Water",       element: "water",  tier: "Rare",   match: ["water"] },
  { id: "earth",    name: "Earth",       element: "earth",  tier: "Rare",   match: ["earth"] },
  { id: "wind",     name: "Wind",        element: "other",  tier: "Rare",   match: ["wind", "air"] },
  { id: "lightning",name: "Lightning",   element: "other",  tier: "Epic",   match: ["lightning", "storm", "electric"] },
  { id: "ice",      name: "Ice",         element: "water",  tier: "Epic",   match: ["ice", "frost"] },
  { id: "shadow",   name: "Shadow",      element: "mythic", tier: "Epic",   match: ["shadow", "dark"] },
  { id: "light",    name: "Light",       element: "other",  tier: "Epic",   match: ["light", "lumen"] },
  { id: "fishy",    name: "Fishy",       element: "water",  tier: "Epic",   match: ["fishy", "fish"] },
  { id: "striker",  name: "Striker",     element: "fire",   tier: "Epic",   match: ["striker"] },
  { id: "aura",     name: "Aura",        element: "mythic", tier: "Epic",   match: ["aura"] },
  { id: "boss",     name: "Boss",        element: "mythic", tier: "Legendary", match: ["boss"] },
  { id: "dream",    name: "Dream",       element: "mythic", tier: "Legendary", match: ["dream"] },
  { id: "punk",     name: "Punk",        element: "fire",   tier: "Legendary", match: ["punk"] },
  { id: "guardian", name: "Guardian",    element: "earth",  tier: "Legendary", match: ["guardian"] },
  { id: "grim",     name: "Grim Reaper", element: "mythic", tier: "Mythic", match: ["grim", "reaper"] },
  { id: "zeropoint",name: "Zero Point",  element: "mythic", tier: "Mythic", match: ["zeropoint", "zero_point", "zero point"] },
  { id: "loot",     name: "Loot",        element: "other",  tier: "Epic",   match: ["loot"] },
];

export function matchCatalogEntry(templateId) {
  const t = String(templateId || "").toLowerCase();
  for (const entry of CATALOG) {
    if (entry.match.some((m) => t.includes(m))) return entry;
  }
  return null;
}

export function matchVariant(templateId) {
  const t = String(templateId || "").toLowerCase();
  for (const v of VARIANTS) {
    if (v !== "Normal" && t.includes(v.toLowerCase())) return v;
  }
  return "Normal";
}
