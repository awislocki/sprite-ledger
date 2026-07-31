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
  FILE_LOOKUP,
  IMG_BASE,
  spriteImage,
} from "../lib/catalog.js";
import { encodeCode, decodeCode, tradeDiff, ownedKeySet } from "../lib/share.js";
import {
  encodeManual,
  decodeManual,
  isAccountId,
  MAX_COOKIE_BYTES,
} from "../lib/manual.js";
import { fixtureItems, EXPECTED } from "./fixtures/sync-athena-2026-07-19.mjs";

const col = buildCollection(fixtureItems());

// Totals: 98 as of 07-23, +19 in the v41.30 wave (2026-07-30): Quack for
// Water/Earth/Fire, Gem+Holofoil Grim, Holofoil+Cube Zero Point, Lootin'
// Llama (5), Peeky Peely (5), Ironmouse (1), John Wick (1) = 117.
assert.equal(TOTAL_VARIANTS, 117, "catalog should carry all 117 variants");
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

// Pod sprites use fortnite-api tags plus "/sprites/..." per-variant
// overrides for v41.30 styles the pod doesn't carry yet; the four v41.30
// sprites are fully self-hosted (imgBase) + manualOnly until the pod picks
// them up (Pollo precedent).
const V4130_SPRITES = ["lootinllama", "peekypeely", "ironmouse", "johnwick"];
for (const s of SPRITES) {
  const selfHosted = V4130_SPRITES.includes(s.slug);
  assert.equal(!!s.imgBase, selfHosted, `${s.slug} imgBase`);
  assert.equal(!!s.manualOnly, selfHosted, `${s.slug} manualOnly`);
  for (const [variant, file] of Object.entries(s.variants)) {
    if (s.imgBase)
      assert.match(file, /^(lootinllama|peekypeely|ironmouse|johnwick)_[a-z]+$/, `${s.slug}/${variant}`);
    else
      assert.match(file, /^(mat|stage|particle)\d+$|^\/sprites\/[a-z_]+$/, `${s.slug}/${variant}`);
  }
}
// Cube Grim graduated to a pod tag on 2026-07-30; the v41.30 additions are
// the current self-hosted batch.
assert.equal(spriteImage(SLUG_LOOKUP.grim, "Cube"), `${IMG_BASE}particle3.png`);
assert.equal(spriteImage(SLUG_LOOKUP.grim, "Holofoil"), "/sprites/grimreaper_holofoil.png");
assert.equal(spriteImage(SLUG_LOOKUP.water, "Quack"), "/sprites/water_quack.png");
assert.equal(spriteImage(SLUG_LOOKUP.peekypeely, "Gold"), "/sprites/peekypeely_gold.png");
assert.equal(spriteImage(SLUG_LOOKUP.johnwick), "/sprites/johnwick_normal.png");

// Batman + Vini Jr are first-class pod sprites: hotlinked pod images, in
// the share set, correct variant sets (Batman 6, Vini base-only).
const batman = SLUG_LOOKUP.batman;
const vini = SLUG_LOOKUP.vinijr;
assert.equal(spriteImage(batman, "Gold"), `${IMG_BASE}particle5.png`);
assert.equal(spriteImage(vini), `${IMG_BASE}particle12.png`);
assert.deepEqual(Object.keys(batman.variants), ["Normal", "Gold", "Gummy", "Galaxy", "Holofoil", "Cube"]);
assert.deepEqual(Object.keys(vini.variants), ["Normal"]);
assert.deepEqual(Object.keys(SLUG_LOOKUP.pollo.variants), ["Normal"]);
// Owned-tag mastery sync covers the collabs now (tags land in FILE_LOOKUP;
// the sync lowercases Epic's "Particle9" before the lookup).
assert.equal(FILE_LOOKUP.particle3.sprite.slug, "grimreaper");
assert.equal(FILE_LOOKUP.particle9.variant, "Cube");
assert.equal(FILE_LOOKUP.particle11.sprite.slug, "pollo");
assert.equal(FILE_LOOKUP.particle12.sprite.slug, "vinijr");
// In the share set (unlike the old provisional approach) + manual keys.
assert.ok(ALL_KEYS.includes("batman:Holofoil") && ALL_KEYS.includes("vinijr:Normal"));
assert.ok(MANUAL_KEYS.has("batman:Gold") && MANUAL_KEYS.has("punk:Gold"));

// Bit-order freeze: share codes assign bit positions from ALL_KEYS order.
// 2026-07-30 snapshot: the v41.30 wave inserted Quack into Water/Earth/Fire,
// Gem+Holofoil into Grim, Holofoil+Cube into Zero Point, and appended
// Lootin' Llama, Peeky Peely, Ironmouse, John Wick — the catalog checksum
// changed, so pre-07-30 codes get the friendly "different version" error
// (by design; same roll happened 07-23).
assert.equal(ALL_KEYS.length, 117, "ALL_KEYS count (107 pod + 10 self-hosted)");
assert.equal(ALL_KEYS[0], "water:Normal");
assert.equal(ALL_KEYS[6], "water:Quack", "Water Quack closes the Water block");
assert.equal(ALL_KEYS[59], "zeropoint:Quack", "pre-Air block boundary");
assert.equal(ALL_KEYS[60], "air:Normal", "Air starts at bit 60");
assert.equal(ALL_KEYS[96], "grimreaper:Cube", "last original-pod key");
assert.equal(ALL_KEYS[97], "batman:Normal", "Batman appended at 97");
assert.equal(ALL_KEYS[102], "batman:Cube", "Batman Cube closes the Batman block");
assert.equal(ALL_KEYS[103], "vinijr:Normal");
assert.equal(ALL_KEYS[104], "pollo:Normal");
assert.equal(ALL_KEYS[105], "lootinllama:Normal", "v41.30 wave starts at 105");
assert.equal(ALL_KEYS[110], "peekypeely:Normal");
assert.equal(ALL_KEYS[114], "peekypeely:Holofoil");
assert.equal(ALL_KEYS[115], "ironmouse:Normal");
assert.equal(ALL_KEYS[116], "johnwick:Normal", "John Wick last");

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
// Display names with spaces or dots must still round-trip: they used to
// encode a space into the name segment, which decodeCode's pattern rejects,
// so those users' codes (and share links) were undecodable — every one.
for (const raw of ["Dark Knight 99", "a.b", "  padded  "]) {
  const c = encodeCode(mine, raw);
  // Dots delimit the three segments; the NAME segment must contain neither a
  // dot nor whitespace or the decoder's pattern can't match it.
  assert.equal(c.split(".").length, 3, `exactly three segments: ${c}`);
  assert.doesNotMatch(c.split(".")[1], /[\s.]/u, `name segment is parse-safe: ${c}`);
  assert.deepEqual([...decodeCode(c).owned].sort(), [...mine].sort(), `round-trips: ${raw}`);
}
assert.equal(decodeCode(encodeCode(mine, "Dark Knight 99")).name, "Dark_Knight_99");
assert.equal(decodeCode(encodeCode(mine, "   ")).name, "Guardian", "blank name falls back");

/* ---- Manual-toggle backup codec (the durable-persistence cookie) ---- */

const ACCT = "abc123";
const toggles = {
  "air:Galaxy": "missing", // suppresses a wrong Epic auto-found
  "punk:Gold": "found",
  "batman:Cube": "mastered",
};
const encoded = encodeManual(ACCT, toggles);
assert.deepEqual(decodeManual(encoded, ACCT), toggles, "backup round-trips");
// Stable output for a given map — that's what lets the client skip no-op
// network writes without ever skipping a real change.
assert.equal(encodeManual(ACCT, { ...toggles }), encoded, "encoding is stable");
assert.notEqual(
  encodeManual(ACCT, { ...toggles, "punk:Gold": "mastered" }),
  encoded,
  "a changed state changes the payload"
);
// Never hand one account another's toggles.
assert.equal(decodeManual(encoded, "someoneelse"), null, "account-scoped");
// Junk in → nothing out (never throw, never invent keys).
assert.equal(decodeManual("garbage", ACCT), null);
assert.equal(decodeManual(undefined, ACCT), null);
assert.deepEqual(decodeManual(`v1.${ACCT}.`, ACCT), {}, "empty payload decodes");
assert.deepEqual(
  decodeManual(`v1.${ACCT}.notakey=f~air:Galaxy=m~punk:Gold=zzz`, ACCT),
  { "air:Galaxy": "missing" },
  "unknown keys and codes are dropped"
);
assert.deepEqual(encodeManual(ACCT, { "notakey:Gold": "found" }), `v1.${ACCT}.`);
// A cookie over ~4KB is dropped SILENTLY by the browser — the whole backup
// would vanish. Even every catalog key at once must stay under the cap.
const everyKey = Object.fromEntries(ALL_KEYS.map((k) => [k, "mastered"]));
assert.ok(
  encodeManual(ACCT, everyKey).length <= MAX_COOKIE_BYTES,
  "a fully-toggled catalog still fits the cookie budget"
);
assert.deepEqual(decodeManual(encodeManual(ACCT, everyKey), ACCT), everyKey);
assert.ok(isAccountId(ACCT) && !isAccountId("bad.id") && !isAccountId(""));

console.log(
  `ok — ${countMastered(col)} mastered, ${countFound(col)} found, ` +
    `${col.unmapped.length} unmapped, ${SPRITES.length} sprites, code ${code.length} chars, ` +
    `backup ${encodeManual(ACCT, everyKey).length}/${MAX_COOKIE_BYTES}B worst case`
);
