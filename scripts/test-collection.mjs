// Regression test for the sync → collection parser, driven by a fixture
// distilled from a real account sync. Run: npm test
import assert from "node:assert/strict";
import {
  buildCollection,
  countOwned,
  slimItem,
  expandSlimItems,
  OWNED,
  PENDING,
} from "../lib/collection.js";
import { SPRITES, TOTAL_VARIANTS, SLUG_LOOKUP } from "../lib/catalog.js";
import { fixtureItems, EXPECTED } from "./fixtures/sync-athena-2026-07-19.mjs";

const col = buildCollection(fixtureItems());

// Totals
assert.equal(TOTAL_VARIANTS, 89, "catalog should carry all 89 variants");
assert.equal(countOwned(col), EXPECTED.owned, "owned count");
const pending = Object.values(col.variants)
  .flatMap((vs) => Object.values(vs))
  .filter((s) => s === PENDING).length;
assert.equal(pending, EXPECTED.pending, "pending count");

// Alias decoding: Epic slugs → catalog sprites
assert.equal(SLUG_LOOKUP.sleepy.slug, "dream");
assert.equal(SLUG_LOOKUP.soccer.slug, "striker");
assert.equal(SLUG_LOOKUP.reddemon.slug, "demon");
assert.equal(SLUG_LOOKUP.crispynut.slug, "theburntpeanut");
assert.equal(SLUG_LOOKUP.drifter.slug, "aura");

// Spot checks against the real account's known state
assert.equal(col.variants.theburntpeanut.Normal, OWNED, "Burnt Peanut complete");
assert.deepEqual(
  col.variants.grimreaper,
  { Normal: PENDING, Gold: PENDING, Gummy: PENDING, Galaxy: PENDING },
  "Grim Reaper all pending, none owned"
);
assert.equal(col.variants.water.Holofoil, OWNED);
assert.equal(col.variants.water.Gem, PENDING);
assert.equal(col.variants.aura.Gold, OWNED, "drifter_gold → Aura Gold");
assert.equal(col.variants.striker.Holofoil, PENDING, "soccer_holofoil → Striker");
assert.equal(col.variants.air, undefined, "Air unseen");

// Signals that bypass the quest flow
assert.equal(col.variants.seven.Gold, OWNED, "owned vtid token → Seven Gold");
assert.equal(col.variants.seven.Normal, OWNED, "backpack style tag → Seven Base");
assert.equal(col.variants.fire.Normal, OWNED, "backpack tag overlap, no dupe");

// Variant creatures: token count = caught, token level = variant level
assert.equal(col.caught.water, 4, "four water creature tokens");
assert.equal(col.caught.fire, 4, "four fire creature tokens");
assert.equal(col.caught.air, 1, "seeded-by-elimination chain q16 → Air");
assert.equal(col.caught.seven, 4, "q17 seed (2) + q19 learned from redeem (2)");
assert.equal(col.caught.grimreaper, undefined, "no tokens → not caught");
assert.equal(col.variantLevels.fire.Galaxy, 5, "L5 token → crowned Fire Galaxy");
assert.equal(col.variantLevels.fire.Normal, 1, "step '' mapped to Base via redeem");
// Global step-letter table names variants on chains with no redeem quests
assert.equal(col.variantLevels.water.Holofoil, 1, "letter e → Holofoil, no redeem needed");
assert.equal(col.variantLevels.seven.Normal, 1, "Seven base creature identified");
assert.equal(col.variantLevels.seven.Gold, 1, "q17c → Seven Gold identified");
assert.equal(col.variantLevels.air.Normal, 1, "q16 → Air base identified");
assert.equal(
  col.variantLevels.grimreaper,
  undefined,
  "no tokens → nothing invented"
);
assert.deepEqual(col.unknownChains, { 22: 1 }, "orphan chain surfaces, not dropped");

// The cached slim report must re-parse to the identical collection — this
// is what lets parser upgrades apply at load time without a fresh sync.
assert.deepEqual(
  buildCollection(expandSlimItems(fixtureItems().map(slimItem))),
  col,
  "slim round-trip parses identically"
);

// Unknown slug surfaces instead of vanishing
assert.equal(col.unmapped.length, 1);
assert.match(col.unmapped[0].templateId, /wanderer_gold/);

// Every catalog sprite renders a valid image URL for each of its variants
for (const s of SPRITES) {
  for (const [variant, file] of Object.entries(s.variants)) {
    assert.match(file, /^(mat|stage|particle)\d+$/, `${s.slug}/${variant} image file`);
  }
}

// Bit-order freeze: share codes assign bit positions from ALL_KEYS order.
// If this assertion fails, a catalog edit reordered or inserted keys —
// existing shared codes will (safely, via checksum) all be rejected. That
// may be intended when the catalog genuinely changes; update the snapshot
// consciously, never casually.
const { ALL_KEYS } = await import("../lib/catalog.js");
assert.equal(ALL_KEYS.length, 89, "ALL_KEYS count frozen");
assert.equal(ALL_KEYS[0], "water:Normal");
assert.equal(ALL_KEYS[54], "zeropoint:Quack", "pre-Air block boundary");
assert.equal(ALL_KEYS[55], "air:Normal", "Air starts at bit 55");
assert.equal(ALL_KEYS[88], "grimreaper:Galaxy", "last key");

// Share codes: encode → decode round-trips the owned set; diff is sane.
const { encodeCode, decodeCode, tradeDiff, ownedKeySet } = await import(
  "../lib/share.js"
);
const mine = ownedKeySet(col);
const code = encodeCode(col, "Wadam1230");
const decoded = decodeCode(code);
assert.equal(decoded.name, "Wadam1230");
assert.deepEqual([...decoded.owned].sort(), [...mine].sort(), "code round-trip");
const empty = decodeCode(encodeCode({ variants: {} }, "Newbie"));
const diff = tradeDiff(mine, empty.owned);
assert.equal(diff.youOffer.length, mine.size, "you offer everything they lack");
assert.equal(diff.theyOffer.length, 0);
assert.throws(() => decodeCode("garbage"), /FMDS1/);

// Robust parsing: prose and trailing punctuation around the code are fine.
const wrapped = decodeCode(`here's my code: ${code}. hit me up`);
assert.deepEqual([...wrapped.owned].sort(), [...mine].sort(), "code inside prose");

// Corruption guards: truncated or bit-shifted codes must NOT half-decode.
const truncated = code.slice(0, code.length - 4);
assert.throws(() => decodeCode(truncated), /different version|cut off/);
const tampered = code.replace(/\.([A-Za-z0-9_-]+)$/, (m, p) => "." + "A" + p.slice(1));
assert.throws(() => decodeCode(tampered), /different version|cut off/);

// Friend names are sanitized on decode too (attacker-controlled string).
const longName = decodeCode(code.replace(/^FMDS1\.[^.]+\./, "FMDS1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX."));
assert.ok(longName.name.length <= 20, "decoded name capped");

console.log(
  `ok — ${countOwned(col)}/${TOTAL_VARIANTS} owned, ${pending} pending, ` +
    `${col.unmapped.length} unmapped, ${SPRITES.length} sprites, ` +
    `code ${code.length} chars`
);
