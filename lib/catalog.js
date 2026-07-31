// Sprite catalog for Chapter 7 Season 3 "Sprite Mastery".
//
// Generated from the Backpack_ColdTrophy ("Sprite Mastery Pod") cosmetic on
// fortnite-api.com — its Mesh variant channel has one image per
// sprite × style combination, which is also the authority on which styles
// exist per sprite (they differ: Earth has Cube but no Holofoil, Zero Point
// has a Quack style, The Burnt Peanut is base-only, etc).
//
// Ownership comes from Epic profile "spritemastery_redeem" quests whose
// premium reward is CosmeticVariantToken:vtid_backpack_coldtrophy_<slug>[_<style>].
// Epic's internal slugs sometimes differ from display names — `aliases` maps
// them (verified against a real account sync on 2026-07-19 by matching each
// slug's style set to the API's per-sprite style set):
//   sleepy → Dream, soccer → Striker, reddemon → Demon,
//   crispynut → TheBurntPeanut, drifter → Aura.
// Air and Seven haven't appeared in sync data yet, so their aliases are
// guesses — a wrong guess just lands the item in the "unmapped" section.

export const IMG_BASE =
  "https://fortnite-api.com/images/cosmetics/br/backpack_coldtrophy/variants/mesh/";

export const VARIANT_ORDER = [
  "Normal",
  "Gold",
  "Gummy",
  "Galaxy",
  "Gem",
  "Holofoil",
  "Cube",
  "Quack",
];

// vtid style suffix → variant key
export const STYLE_SUFFIXES = {
  gold: "Gold",
  gummy: "Gummy",
  galaxy: "Galaxy",
  gem: "Gem",
  holofoil: "Holofoil",
  cube: "Cube",
  quack: "Quack",
};

export const SPRITES = [
  // Quack variants for Water/Earth/Fire arrived with v41.30 (2026-07-30,
  // Sprite Mastery Part 4 milestones 35/40/45); wiki renders self-hosted
  // until fortnite-api's pod carries them.
  { slug: "water",     name: "Water",       element: "water",  aliases: [],
    variants: { Normal: "mat1", Gold: "mat2", Gummy: "mat3", Galaxy: "mat4", Gem: "mat5", Holofoil: "mat6",
      Quack: "/sprites/water_quack" } },
  { slug: "earth",     name: "Earth",       element: "earth",  aliases: [],
    variants: { Normal: "mat7", Gold: "mat8", Gummy: "mat9", Galaxy: "mat10", Gem: "mat11", Cube: "mat12",
      Quack: "/sprites/earth_quack" } },
  { slug: "fire",      name: "Fire",        element: "fire",   aliases: [],
    variants: { Normal: "mat13", Gold: "mat14", Gummy: "mat15", Galaxy: "mat16", Holofoil: "mat17", Cube: "mat18",
      Quack: "/sprites/fire_quack" } },
  { slug: "duck",      name: "Duck",        element: "other",  aliases: [],
    variants: { Normal: "mat19", Gold: "mat20", Gummy: "mat21", Galaxy: "mat22", Gem: "mat23" } },
  { slug: "ghost",     name: "Ghost",       element: "mythic", aliases: [],
    variants: { Normal: "mat24", Gold: "mat25", Gummy: "mat26", Galaxy: "mat27", Holofoil: "mat28" } },
  { slug: "demon",     name: "Demon",       element: "fire",   aliases: ["reddemon"],
    variants: { Normal: "mat29", Gold: "mat30", Gummy: "mat31", Galaxy: "mat32", Gem: "mat33" } },
  { slug: "king",      name: "King",        element: "mythic", aliases: [],
    variants: { Normal: "mat34", Gold: "mat35", Gummy: "mat36", Galaxy: "mat37", Holofoil: "mat38" } },
  { slug: "dream",     name: "Dream",       element: "mythic", aliases: ["sleepy"],
    variants: { Normal: "mat39", Gold: "mat40", Gummy: "mat41", Galaxy: "mat42", Cube: "mat43" } },
  { slug: "punk",      name: "Punk",        element: "fire",   aliases: [],
    variants: { Normal: "mat44", Gold: "mat45", Gummy: "mat46", Galaxy: "mat47", Cube: "mat48" } },
  { slug: "theburntpeanut", name: "The Burnt Peanut", element: "other", aliases: ["crispynut"],
    variants: { Normal: "mat49" } },
  // Holofoil + Cube new in v41.30 (2026-07-30); Quack (mat55) predates them.
  { slug: "zeropoint", name: "Zero Point",  element: "mythic", aliases: [],
    variants: { Normal: "mat50", Gold: "mat51", Gummy: "mat52", Galaxy: "mat53", Gem: "mat54",
      Holofoil: "/sprites/zeropoint_holofoil", Cube: "/sprites/zeropoint_cube", Quack: "mat55" } },
  { slug: "air",       name: "Air",         element: "other",  aliases: ["wind"],
    variants: { Normal: "stage1", Gold: "stage2", Gummy: "stage3", Galaxy: "stage4", Holofoil: "stage5" } },
  { slug: "fishy",     name: "Fishy",       element: "water",  aliases: [],
    variants: { Normal: "stage6", Gold: "stage7", Gummy: "stage8", Galaxy: "stage9", Cube: "stage10" } },
  { slug: "striker",   name: "Striker",     element: "fire",   aliases: ["soccer"],
    variants: { Normal: "stage11", Gold: "stage12", Gummy: "stage13", Galaxy: "stage14", Holofoil: "stage15" } },
  { slug: "aura",      name: "Aura",        element: "mythic", aliases: ["drifter"],
    variants: { Normal: "stage16", Gold: "stage17", Gummy: "stage18", Galaxy: "stage19", Gem: "stage20" } },
  { slug: "boss",      name: "Boss",        element: "mythic", aliases: [],
    variants: { Normal: "stage21", Gold: "stage22", Gummy: "stage23", Galaxy: "stage24", Cube: "stage25" } },
  { slug: "seven",     name: "Seven",       element: "other",  aliases: [],
    variants: { Normal: "stage26", Gold: "stage27", Gummy: "stage28", Galaxy: "stage29", Holofoil: "stage30" } },
  // Gem + Holofoil new in v41.30 (2026-07-30). Gem was VAULTED the same day
  // at 2 PM EDT (~5h window) — kept: anyone who caught one can track it.
  { slug: "grimreaper", name: "Grim Reaper", element: "mythic", aliases: ["grim"],
    variants: { Normal: "stage31", Gold: "stage32", Gummy: "particle1", Galaxy: "particle2",
      Gem: "/sprites/grimreaper_gem", Holofoil: "/sprites/grimreaper_holofoil", Cube: "particle3" } },

  // Collab sprites award their OWN backbling in-game, but Epic also folded
  // their styles into the pod's Mesh channel (fortnite-api caught up
  // 2026-07-30), so they're ordinary pod sprites now: hotlinked pod images,
  // owned-tag mastery via FILE_LOOKUP. Their vtid slugs are still unverified
  // by a live sync — a mismatch just lands in the "unmapped" section. Kept
  // appended last so the share bit-order above is unchanged.
  { slug: "batman", name: "Batman", element: "mythic", aliases: [],
    variants: { Normal: "particle4", Gold: "particle5", Gummy: "particle6",
      Galaxy: "particle7", Holofoil: "particle8", Cube: "particle9" } },
  { slug: "vinijr", name: "Vini Jr.", element: "other", aliases: [],
    variants: { Normal: "particle12" } },
  // Mythic collab-style sprite from the 41.20 "Hot Bat Summer" wave; base-only
  // (like Vini), spawning naturally since 2026-07-23.
  { slug: "pollo", name: "Pollo", element: "mythic", aliases: [],
    variants: { Normal: "particle11" } },

  // v41.30 wave (2026-07-30): none of these exist in fortnite-api's pod yet,
  // so renders are self-hosted wiki art (imgBase) and they're manualOnly
  // until a sync or the pod reveals their Epic tags/slugs (Pollo precedent —
  // swap to pod tags + drop manualOnly once catalog:check reports them).
  // Appended in-order: pod sprites first, collabs last. Epic slugs unknown;
  // wrong guesses surface in the "unmapped" section.
  { slug: "lootinllama", name: "Lootin' Llama", element: "other", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    // Gem: file shipped in the same batch and the Loot Pool says
    // Legendary-to-Special, but the wiki "New" list omits it — see CLAUDE.md.
    variants: { Normal: "lootinllama_normal", Gold: "lootinllama_gold", Gummy: "lootinllama_gummy",
      Galaxy: "lootinllama_galaxy", Gem: "lootinllama_gem" } },
  { slug: "peekypeely", name: "Peeky Peely", element: "other", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "peekypeely_normal", Gold: "peekypeely_gold", Gummy: "peekypeely_gummy",
      Galaxy: "peekypeely_galaxy", Holofoil: "peekypeely_holofoil" } },
  // VTuber collab; went live with v41.30 and was VAULTED the same day at
  // 2 PM EDT (likely an accidental early enable) — kept for the few who
  // caught one; expect a proper release later.
  { slug: "ironmouse", name: "Ironmouse", element: "mythic", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "ironmouse_normal" } },
  // John Wick collab, found in the Reload mode ("the only Sprite that can be
  // equipped in Reload"), keeps its found level; own Extraction Frame
  // backbling (Batman pattern), base-only at launch.
  { slug: "johnwick", name: "John Wick", element: "mythic", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "johnwick_normal" } },
];

// vtid slug (canonical or alias) → sprite entry
export const SLUG_LOOKUP = (() => {
  const map = {};
  for (const s of SPRITES) {
    map[s.slug] = s;
    for (const a of s.aliases) map[a] = s;
  }
  return map;
})();

export const TOTAL_VARIANTS = SPRITES.reduce(
  (n, s) => n + Object.keys(s.variants).length,
  0
);

// Every sprite (pod + collab) lives in SPRITES now. Alias kept for callers.
export const ALL_SPRITES = SPRITES;

// Image file / Epic variant tag ("mat13", "stage26", "particle2") → what it
// is. Sprites with an imgBase (self-hosted — the v41.30 wave) and "/"
// overrides carry no Epic tag and are skipped.
export const FILE_LOOKUP = (() => {
  const map = {};
  for (const s of SPRITES) {
    if (s.imgBase) continue;
    for (const [variant, file] of Object.entries(s.variants))
      if (!file.startsWith("/")) map[file] = { sprite: s, variant };
  }
  return map;
})();

// Canonical ordering of every sprite:variant pair — the bit order for share
// codes. Append-only: reordering or inserting breaks previously shared codes.
export const ALL_KEYS = SPRITES.flatMap((s) =>
  VARIANT_ORDER.filter((v) => s.variants[v]).map((v) => `${s.slug}:${v}`)
);

export function spriteVariants(sprite) {
  return VARIANT_ORDER.filter((v) => sprite.variants[v]);
}

export function spriteImage(sprite, variantKey = "Normal") {
  const file = sprite.variants[variantKey] || sprite.variants.Normal;
  // A leading "/" is a self-hosted per-variant override — used when Epic
  // releases a pod style before fortnite-api has its image (Cube Grim was
  // one until 2026-07-30; the v41.30 variants are the current batch).
  if (file.startsWith("/")) return `${file}.png`;
  return `${sprite.imgBase || IMG_BASE}${file}.png`;
}

// Every valid "slug:Variant" key — used to prune stale manual toggles. Same
// membership as ALL_KEYS (every sprite is in the share set now).
export const MANUAL_KEYS = new Set(ALL_KEYS);
