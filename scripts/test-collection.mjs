// Regression test for the sync → collection parser (three states:
// mastered / found / missing). Run: npm test
import assert from "node:assert/strict";
import {
  buildCollection,
  countMastered,
  countFound,
  slimItem,
  expandSlimItems,
} from "../lib/collection.js";
import {
  SPRITES,
  MANUAL_KEYS,
  TOTAL_VARIANTS,
  SLUG_LOOKUP,
  ALL_KEYS,
  spriteImage,
} from "../lib/catalog.js";
import { encodeCode, decodeCode, tradeDiff, ownedKeySet } from "../lib/share.js";
import { fixtureItems, EXPECTED } from "./fixtures/sync-athena-2026-07-19.mjs";

const col = buildCollection(fixtureItems());

// Totals (90 pod variants + Batman's 6 + Vini Jr's 1 + Pollo's 1 = 98)
assert.equal(TOTAL_VARIANTS, 98, "catalog should carry all 98 variants");
assert.equal(countMastered(col), EXPECTED.mastered, "mastered count");
assert.equal(countFound(col), EXPECTED.found, "found count");

// Alias decoding: Epic slugs → catalog sprites
assert.equal(SLUG_LOOKUP.sleepy.slug, "dream");
assert.equal(SLUG_LOOKUP.soccer.slug, "striker");
assert.equal(SLUG_LOOKUP.reddemon.slug, "demon");
assert.equal(SLUG_LOOKUP.crispynut.slug, "theburntpeanut");
assert.equal(SLUG_LOOKUP.drifter.slug, "aura");

// MASTERED = backbling tags only
assert.deepEqual(col.mastered.fire, { Normal: true, Gold: true }, "backbling → mastered");
assert.equal(Object.keys(col.mastered).length, 1, "only Fire mastered");

// FOUND = claimed redeems + possessed tokens + caught creatures, minus mastered
assert.deepEqual(col.found.water, { Normal: true, Gummy: true }, "redeem + token → found");
assert.deepEqual(col.found.ghost, { Normal: true }, "vtid token → found");
assert.deepEqual(col.found.seven, { Normal: true, Gummy: true }, "learned chain q19 → Seven");
assert.equal(col.found.fire, undefined, "Fire Base is mastered → not double-listed in found");
assert.equal(col.found.water.Gold, undefined, "Active redeem is NOT found");

// Unknown chain surfaces; nothing invented
assert.deepEqual(col.unknownChains, { 22: 1 }, "orphan chain surfaces, not dropped");
assert.equal(col.mastered.grimreaper, undefined);
assert.equal(col.found.grimreaper, undefined);

// Unknown slug surfaces instead of vanishing
assert.equal(col.unmapped.length, 1);
assert.match(col.unmapped[0].templateId, /wanderer_gold/);

// The cached slim report must re-parse to the identical collection.
assert.deepEqual(
  buildCollection(expandSlimItems(fixtureItems().map(slimItem))),
  col,
  "slim round-trip parses identically"
);

// Pod sprites use fortnite-api tags (or a "/sprites/..." self-hosted override
// for styles fortnite-api doesn't carry yet); collab (manualOnly) sprites use
// local /sprites/ images.
for (const s of SPRITES) {
  for (const [variant, file] of Object.entries(s.variants)) {
    if (s.imgBase) assert.match(file, /^(batman|vinijr|pollo)_[a-z]+$/, `${s.slug}/${variant}`);
    else
      assert.match(
        file,
        /^(mat|stage|particle)\d+$|^\/sprites\/[a-z_]+$/,
        `${s.slug}/${variant}`
      );
  }
}
// The self-hosted override resolves to a local png, not IMG_BASE.
assert.equal(spriteImage(SLUG_LOOKUP.grim, "Cube"), "/sprites/grimreaper_cube.png");

// Batman + Vini Jr are now first-class sprites: real self-hosted images, in
// the share set, correct variant sets (Batman 5, Vini base-only).
const batman = SLUG_LOOKUP.batman;
const vini = SLUG_LOOKUP.vinijr;
assert.ok(batman?.manualOnly && vini?.manualOnly, "collab sprites flagged manualOnly");
assert.equal(spriteImage(batman, "Gold"), "/sprites/batman_gold.png");
assert.equal(spriteImage(vini), "/sprites/vinijr_normal.png");
assert.deepEqual(Object.keys(batman.variants), ["Normal", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"]);
assert.deepEqual(Object.keys(vini.variants), ["Normal"]);
assert.deepEqual(Object.keys(SLUG_LOOKUP.pollo.variants), ["Normal"]);
assert.ok(SLUG_LOOKUP.pollo.manualOnly, "Pollo tracked manually until synced");
// In the share set (unlike the old provisional approach) + manual keys.
assert.ok(ALL_KEYS.includes("batman:Holofoil") && ALL_KEYS.includes("vinijr:Normal"));
assert.ok(MANUAL_KEYS.has("batman:Gold") && MANUAL_KEYS.has("punk:Gold"));

// Bit-order freeze: share codes assign bit positions from ALL_KEYS order.
// 2026-07-23 snapshot: Cube Grim + Cube Batman + Pollo inserted/appended —
// the catalog checksum changed, so pre-07-23 codes get the friendly
// "different version" error (by design).
assert.equal(ALL_KEYS.length, 98, "ALL_KEYS count (90 pod + 8 collab)");
assert.equal(ALL_KEYS[0], "water:Normal");
assert.equal(ALL_KEYS[54], "zeropoint:Quack", "pre-Air block boundary");
assert.equal(ALL_KEYS[55], "air:Normal", "Air starts at bit 55");
assert.equal(ALL_KEYS[89], "grimreaper:Cube", "last pod key — collab appended after");
assert.equal(ALL_KEYS[90], "batman:Normal", "Batman appended at 90");
assert.equal(ALL_KEYS[95], "batman:Cube", "Batman Cube closes the Batman block");
assert.equal(ALL_KEYS[96], "vinijr:Normal");
assert.equal(ALL_KEYS[97], "pollo:Normal", "Pollo last");

// Share owned set = mastered ∪ found (+ optional manual keys).
const mine = ownedKeySet(col);
assert.equal(mine.size, EXPECTED.mastered + EXPECTED.found, "owned = mastered + found");
assert.ok(mine.has("fire:Normal") && mine.has("water:Gummy"));
const withManual = ownedKeySet(col, ["punk:Gold"]);
assert.ok(withManual.has("punk:Gold"), "manual keys fold into the owned set");

// Share codes: encode → decode round-trips the owned set; diff is sane.
const code = encodeCode(col, "Wadam1230");
const decoded = decodeCode(code);
assert.equal(decoded.name, "Wadam1230");
assert.deepEqual([...decoded.owned].sort(), [...mine].sort(), "code round-trip");
const empty = decodeCode(encodeCode({ mastered: {}, found: {} }, "Newbie"));
const diff = tradeDiff(mine, empty.owned);
assert.equal(diff.youOffer.length, mine.size, "you offer everything they lack");
assert.equal(diff.theyOffer.length, 0);
assert.throws(() => decodeCode("garbage"), /FMDS1/);
const wrapped = decodeCode(`here's my code: ${code}. hit me up`);
assert.deepEqual([...wrapped.owned].sort(), [...mine].sort(), "code inside prose");
assert.throws(() => decodeCode(code.slice(0, code.length - 4)), /different version|cut off/);

console.log(
  `ok — ${countMastered(col)} mastered, ${countFound(col)} found, ` +
    `${col.unmapped.length} unmapped, ${SPRITES.length} sprites, code ${code.length} chars`
);
