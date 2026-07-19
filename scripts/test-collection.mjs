// Regression test for the sync → collection parser, driven by a fixture
// distilled from a real account sync. Run: npm test
import assert from "node:assert/strict";
import { buildCollection, countOwned, OWNED, PENDING } from "../lib/collection.js";
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
assert.equal(col.variants.seven, undefined, "Seven unseen");

// Unknown slug surfaces instead of vanishing
assert.equal(col.unmapped.length, 1);
assert.match(col.unmapped[0].templateId, /wanderer_gold/);

// Every catalog sprite renders a valid image URL for each of its variants
for (const s of SPRITES) {
  for (const [variant, file] of Object.entries(s.variants)) {
    assert.match(file, /^(mat|stage|particle)\d+$/, `${s.slug}/${variant} image file`);
  }
}

console.log(
  `ok — ${countOwned(col)}/${TOTAL_VARIANTS} owned, ${pending} pending, ` +
    `${col.unmapped.length} unmapped, ${SPRITES.length} sprites`
);
