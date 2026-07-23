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
  { slug: "water",     name: "Water",       element: "water",  aliases: [],
    variants: { Normal: "mat1", Gold: "mat2", Gummy: "mat3", Galaxy: "mat4", Gem: "mat5", Holofoil: "mat6" } },
  { slug: "earth",     name: "Earth",       element: "earth",  aliases: [],
    variants: { Normal: "mat7", Gold: "mat8", Gummy: "mat9", Galaxy: "mat10", Gem: "mat11", Cube: "mat12" } },
  { slug: "fire",      name: "Fire",        element: "fire",   aliases: [],
    variants: { Normal: "mat13", Gold: "mat14", Gummy: "mat15", Galaxy: "mat16", Holofoil: "mat17", Cube: "mat18" } },
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
  { slug: "zeropoint", name: "Zero Point",  element: "mythic", aliases: [],
    variants: { Normal: "mat50", Gold: "mat51", Gummy: "mat52", Galaxy: "mat53", Gem: "mat54", Quack: "mat55" } },
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
  { slug: "grimreaper", name: "Grim Reaper", element: "mythic", aliases: ["grim"],
    // Cube released 2026-07-23 ("New Sprite Day") but fortnite-api's pod
    // doesn't carry its image yet — self-hosted render until it does; swap
    // to the real pod tag when catalog:check reports it.
    variants: { Normal: "stage31", Gold: "stage32", Gummy: "particle1", Galaxy: "particle2",
      Cube: "/sprites/grimreaper_cube" } },

  // Collab sprites: they award their OWN backbling (not a Sprite Mastery Pod
  // variant), so they never appear in the pod/fortnite-api and can't be
  // auto-synced yet — `manualOnly` (tracked by tapping). Real renders are
  // self-hosted under /sprites/ (via imgBase). Appended last so the share
  // bit-order for the pod sprites above is unchanged.
  { slug: "batman", name: "Batman", element: "mythic", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "batman_normal", Gold: "batman_gold", Gummy: "batman_gummy",
      Galaxy: "batman_galaxy", Holofoil: "batman_holofoil", Cube: "batman_cube" } },
  { slug: "vinijr", name: "Vini Jr.", element: "other", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "vinijr_normal" } },
  // Mythic collab-style sprite from the 41.20 "Hot Bat Summer" wave; base-only
  // (like Vini), spawning naturally since 2026-07-23. Own backbling, so not a
  // pod variant — manualOnly until sync data reveals its slug.
  { slug: "pollo", name: "Pollo", element: "mythic", manualOnly: true, aliases: [],
    imgBase: "/sprites/",
    variants: { Normal: "pollo_normal" } },
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
// is. Only pod sprites (no imgBase) have Epic tags; collab sprites are skipped.
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
  // releases a pod style before fortnite-api has its image (e.g. Cube Grim).
  if (file.startsWith("/")) return `${file}.png`;
  return `${sprite.imgBase || IMG_BASE}${file}.png`;
}

// Every valid "slug:Variant" key — used to prune stale manual toggles. Same
// membership as ALL_KEYS (every sprite is in the share set now).
export const MANUAL_KEYS = new Set(ALL_KEYS);
