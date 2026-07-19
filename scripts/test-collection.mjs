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
import { SPRITES, TOTAL_VARIANTS, SLUG_LOOKUP, ALL_KEYS } from "../lib/catalog.js";
import { encodeCode, decodeCode, tradeDiff, ownedKeySet } from "../lib/share.js";
import { fixtureItems, EXPECTED } from "./fixtures/sync-athena-2026-07-19.mjs";

const col = buildCollection(fixtureItems());

// Totals
assert.equal(TOTAL_VARIANTS, 89, "catalog should carry all 89 variants");
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

// Every catalog sprite renders a valid image file for each of its variants
for (const s of SPRITES) {
  for (const [variant, file] of Object.entries(s.variants)) {
    assert.match(file, /^(mat|stage|particle)\d+$/, `${s.slug}/${variant} image file`);
  }
}

// Bit-order freeze: share codes assign bit positions from ALL_KEYS order.
assert.equal(ALL_KEYS.length, 89, "ALL_KEYS count frozen");
assert.equal(ALL_KEYS[0], "water:Normal");
assert.equal(ALL_KEYS[54], "zeropoint:Quack", "pre-Air block boundary");
assert.equal(ALL_KEYS[55], "air:Normal", "Air starts at bit 55");
assert.equal(ALL_KEYS[88], "grimreaper:Galaxy", "last key");

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
