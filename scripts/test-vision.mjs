// Tests for reading a collection out of an arbitrary image.
//
// The model's answer is never trusted as-is: it can only pick from the
// catalog's enums, and everything it picks is re-checked against the catalog
// here. These tests pin that mapping, because a sprite/style pair that Epic
// never shipped would otherwise land in somebody's collection and the round
// would ask them to trade it away. Run: npm test
import assert from "node:assert/strict";
import {
  SPRITE_LABELS,
  VARIANT_LABELS,
  READING_SCHEMA,
  SYSTEM_PROMPT,
  toKey,
  fromKey,
  readingToKeys,
  ownedFromReading,
} from "../lib/vision-catalog.js";
import { SPRITES, ALL_KEYS, VARIANT_ORDER, TOTAL_VARIANTS } from "../lib/catalog.js";

/* ---- The vocabulary is the catalog's, not the model's ---- */

assert.equal(SPRITE_LABELS.length, SPRITES.length, "every sprite is nameable");
assert.ok(SPRITE_LABELS.includes("Grim Reaper") && SPRITE_LABELS.includes("Peeky Peely"));
assert.equal(VARIANT_LABELS.length, VARIANT_ORDER.length);
// Sources write the base style as "Base" (or omit it); the catalog calls it
// Normal, and that translation has to survive in both directions.
assert.ok(VARIANT_LABELS.includes("Base") && !VARIANT_LABELS.includes("Normal"));
assert.equal(toKey("Water", "Base"), "water:Normal");
assert.deepEqual(fromKey("water:Normal"), { sprite: "Water", variant: "Base" });

// Round-trip every catalog key through the labels the model sees.
for (const key of ALL_KEYS) {
  const info = fromKey(key);
  assert.ok(info, `${key} is nameable`);
  assert.ok(SPRITE_LABELS.includes(info.sprite), `${info.sprite} in enum`);
  assert.ok(VARIANT_LABELS.includes(info.variant), `${info.variant} in enum`);
  assert.equal(toKey(info.sprite, info.variant), key, `${key} round-trips`);
}

// Names are matched forgivingly — case and stray spaces shouldn't lose a tile.
assert.equal(toKey("  grim reaper ", "Gold"), "grimreaper:Gold");
assert.equal(toKey("ZERO POINT", "Quack"), "zeropoint:Quack");

// Style sets differ per sprite, so a plausible pair can still be fiction.
assert.equal(toKey("Earth", "Holofoil"), null, "Earth has Cube, not Holofoil");
assert.equal(toKey("The Burnt Peanut", "Gold"), null, "base-only sprite");
assert.equal(toKey("Sprite That Isn't", "Gold"), null);
assert.equal(toKey("Water", "Sparkly"), null);
assert.equal(toKey(undefined, undefined), null);
assert.equal(fromKey("nope:Gold"), null);

/* ---- The schema constrains the model to that vocabulary ---- */

const item = READING_SCHEMA.properties.sprites.items;
assert.deepEqual(item.properties.sprite.enum, SPRITE_LABELS);
assert.deepEqual(item.properties.variant.enum, VARIANT_LABELS);
assert.equal(item.additionalProperties, false, "structured outputs require this");
assert.equal(READING_SCHEMA.additionalProperties, false);
assert.deepEqual(item.required, ["sprite", "variant", "sure"]);
// Polarity is the field that inverts a whole collection if it's wrong, so it
// must be a closed set with an explicit "don't know".
assert.deepEqual(READING_SCHEMA.properties.listKind.enum, ["owned", "missing", "unclear"]);
assert.match(SYSTEM_PROMPT, /looking for these/, "prompt names the real headings");

/* ---- A reading becomes keys, or is dropped ---- */

const reading = readingToKeys({
  listKind: "missing",
  heading: "I'M LOOKING FOR THESE",
  unreadable: 2,
  sprites: [
    { sprite: "Grim Reaper", variant: "Gold", sure: true },
    { sprite: "Zero Point", variant: "Holofoil", sure: false },
    { sprite: "Grim Reaper", variant: "Gold", sure: true }, // duplicate tile
    { sprite: "Earth", variant: "Holofoil", sure: true }, // doesn't exist
    { sprite: "Made Up", variant: "Gold", sure: true }, // hallucinated sprite
  ],
});
assert.deepEqual(reading.keys, ["grimreaper:Gold", "zeropoint:Holofoil"]);
assert.deepEqual(reading.unsure, ["zeropoint:Holofoil"], "low-confidence picks are flagged");
assert.equal(reading.dropped, 2, "impossible pairs are counted, not kept");
assert.equal(reading.unreadable, 2);
assert.equal(reading.listKind, "missing");
assert.equal(reading.heading, "I'M LOOKING FOR THESE");

// Junk in never throws and never invents a collection.
for (const junk of [null, undefined, {}, { sprites: "nope" }, { sprites: [null] }]) {
  const out = readingToKeys(junk);
  assert.deepEqual(out.keys, [], `no keys from ${JSON.stringify(junk)}`);
  assert.equal(out.listKind, "unclear", "an unreadable polarity is never guessed");
}
assert.equal(readingToKeys({ listKind: "owned" }).listKind, "owned");
assert.equal(readingToKeys({ listKind: "sideways" }).listKind, "unclear");

/* ---- Polarity: the inversion that decides what someone can trade ---- */

const wants = ["grimreaper:Gold", "batman:Cube"];

// An owned list is the collection.
assert.deepEqual(ownedFromReading(wants, "owned").sort(), [...wants].sort());

// A missing list is everything else — the inversion that makes a fortnite.gg
// "I'm looking for these" grid usable at all.
const inverted = ownedFromReading(wants, "missing");
assert.equal(inverted.length, TOTAL_VARIANTS - wants.length);
assert.ok(!inverted.includes("grimreaper:Gold") && !inverted.includes("batman:Cube"));
assert.ok(inverted.includes("water:Normal"), "unlisted sprites count as owned");
// Order must stay catalog order — share codes are a bitmap over ALL_KEYS.
assert.deepEqual(inverted, ALL_KEYS.filter((k) => !wants.includes(k)));

// "unclear" must never silently invert; it's treated as a plain list until a
// human picks a side in the review screen.
assert.deepEqual(ownedFromReading(wants, "unclear").sort(), [...wants].sort());

// The degenerate ends stay sane.
assert.equal(ownedFromReading([], "missing").length, TOTAL_VARIANTS, "missing nothing = has all");
assert.equal(ownedFromReading(ALL_KEYS, "missing").length, 0, "missing everything = has none");

console.log(
  `ok — image reading: ${SPRITE_LABELS.length} sprites × ${VARIANT_LABELS.length} styles, ` +
    `${ALL_KEYS.length} keys round-trip, impossible pairs dropped`
);
