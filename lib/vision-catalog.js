// Vocabulary and mapping for reading a collection out of an arbitrary image.
//
// The model is never asked to invent sprite names: it picks from the catalog's
// own enums, and everything it returns is mapped back through the catalog here.
// A combination that doesn't exist (Holofoil Earth, say) is dropped rather than
// trusted — the catalog is the authority on which styles each sprite has, and a
// plausible-but-wrong pair would put a sprite in someone's collection that Epic
// never shipped.
//
// Pure + framework-free so scripts/test-vision.mjs can run it in node.

import { SPRITES, VARIANT_ORDER, ALL_KEYS } from "./catalog.js";

// Sources label the base style "Base" (ours) or omit it entirely (fortnite.gg
// writes a bare "Grim"); the catalog calls it Normal.
export const BASE_LABEL = "Base";

const label = (variant) => (variant === "Normal" ? BASE_LABEL : variant);
const unlabel = (name) => (name === BASE_LABEL ? "Normal" : name);

export const SPRITE_LABELS = SPRITES.map((s) => s.name);
export const VARIANT_LABELS = VARIANT_ORDER.map(label);

const BY_LABEL = new Map(SPRITES.map((s) => [s.name.toLowerCase(), s]));

// "Grim Reaper" + "Gold" → "grimreaper:Gold", or null when the pair isn't a
// real catalog entry.
export function toKey(spriteLabel, variantLabel) {
  const sprite = BY_LABEL.get(String(spriteLabel || "").trim().toLowerCase());
  if (!sprite) return null;
  const variant = unlabel(String(variantLabel || "").trim());
  return sprite.variants[variant] ? `${sprite.slug}:${variant}` : null;
}

export function fromKey(key) {
  const [slug, variant] = String(key).split(":");
  const sprite = SPRITES.find((s) => s.slug === slug);
  return sprite ? { sprite: sprite.name, variant: label(variant) } : null;
}

// The structured-output schema the model must fill in. Enums do the heavy
// lifting: the model can only name sprites and styles that exist, so the
// failure mode is a wrong pick from a valid list, never free-text garbage.
// (Structured outputs reject numeric/length constraints, so bounds are stated
// in the prompt instead.)
export const READING_SCHEMA = {
  type: "object",
  properties: {
    listKind: {
      type: "string",
      enum: ["owned", "missing", "unclear"],
      description:
        "What the pictured sprites represent for the person who shared it: " +
        "'owned' if the image shows sprites they HAVE, 'missing' if it shows " +
        "sprites they WANT or are looking for, 'unclear' if the image doesn't say.",
    },
    heading: {
      type: "string",
      description:
        "The heading or caption you read the list kind from, verbatim. Empty string if there wasn't one.",
    },
    sprites: {
      type: "array",
      description: "One entry per sprite tile visible in the image.",
      items: {
        type: "object",
        properties: {
          sprite: { type: "string", enum: SPRITE_LABELS },
          variant: { type: "string", enum: VARIANT_LABELS },
          sure: {
            type: "boolean",
            description:
              "true when the tile's label is legible and unambiguous; false when you inferred it from the artwork or a partial label.",
          },
        },
        required: ["sprite", "variant", "sure"],
        additionalProperties: false,
      },
    },
    unreadable: {
      type: "integer",
      description: "How many sprite tiles you could see but could not identify.",
    },
  },
  required: ["listKind", "heading", "sprites", "unreadable"],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `You read Fortnite "Sprite" collection screenshots and report exactly which sprites appear.

A sprite has a name (e.g. Grim Reaper, Zero Point, Peeky Peely) and a style (Base, Gold, Gummy, Galaxy, Gem, Holofoil, Cube, Quack). Sources label a tile style-first — "Gold Zero Point", "Cube Batman", "Gummy Peely" — and write the base style either as "Base" or by omitting it entirely, so a tile labelled just "Grim" is Base Grim.

Report only tiles you can actually see. Do not add sprites that "should" be there, do not complete a set, and do not repeat a tile. If a tile's label is cut off or you are reading the style from the artwork's colour rather than its text, still report it but set sure=false. Count tiles you cannot identify at all in "unreadable" instead of guessing.

Getting listKind right matters more than any individual tile: the same grid means opposite things depending on its heading. "I'm looking for these", "Missing", "Needed", "Wanted" mean missing. "Owned", "Collected", "My collection", "Have" mean owned. If no heading tells you, answer unclear — do not infer it from how full the grid looks.`;

export const USER_PROMPT =
  "Read this Sprite collection image. List every sprite tile you can see, and " +
  "say whether the image shows sprites this person HAS or sprites they are " +
  "MISSING. Stop at 130 tiles — that is more than the whole catalog.";

/**
 * Turn a model reading into catalog keys, dropping anything that isn't a real
 * sprite/style combination.
 *
 * @returns { keys, unsure, dropped, listKind, heading, unreadable }
 */
export function readingToKeys(reading) {
  const keys = [];
  const unsure = new Set();
  const seen = new Set();
  let dropped = 0;

  for (const item of reading?.sprites || []) {
    const key = toKey(item?.sprite, item?.variant);
    if (!key) {
      dropped++;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (item?.sure === false) unsure.add(key);
  }

  return {
    keys,
    unsure: [...unsure],
    dropped,
    listKind: ["owned", "missing", "unclear"].includes(reading?.listKind)
      ? reading.listKind
      : "unclear",
    heading: String(reading?.heading || "").slice(0, 120),
    unreadable: Number.isInteger(reading?.unreadable) ? reading.unreadable : 0,
  };
}

// A "missing" list names what someone LACKS, so their collection is everything
// else. That inversion is only sound if the list is complete — a cropped
// screenshot would hand them sprites they don't own — which is why the UI shows
// the result for confirmation before anyone joins a room with it.
export function ownedFromReading(keys, listKind) {
  const named = new Set(keys);
  if (listKind !== "missing") return [...named];
  return ALL_KEYS.filter((k) => !named.has(k));
}
