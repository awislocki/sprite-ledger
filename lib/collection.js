// Turns raw synced Epic profile items into per-variant state.
//
// Three states (Adam's model):
//   MASTERED — the variant's pod backbling style is unlocked, which only
//     happens once that variant is MASTERED in-game. Authoritative, from the
//     Sprite Mastery Pod backpack's `owned` tags. Shows the crown.
//   FOUND — you have the variant in-game but haven't mastered it. Epic
//     doesn't expose this cleanly, so it comes from softer signals we DO see
//     (a possessed variant token, a claimed redeem reward, a caught-creature
//     mastery token) PLUS the user's own manual toggles (layered in the UI,
//     persisted on-device). MASTERED always supersedes FOUND.
//   MISSING — neither.
//
// Season plumbing (bundles, schedules, daily vending quests) is skipped.
// Sprite-ish items we can't classify go to `unmapped`; mastery chains whose
// sprite we can't name yet (new collab sprites) go to `unknownChains`.

import { SLUG_LOOKUP, STYLE_SUFFIXES, FILE_LOOKUP } from "./catalog.js";

const VTID_RE = /^CosmeticVariantToken:vtid_backpack_coldtrophy_(.+)$/i;
const BACKPACK_RE = /^AthenaBackpack:.*coldtrophy/i;
const REDEEM_QUEST_RE = /^Quest:quest_s\d+_spritemastery_redeem_p\d+_q(\d+)([a-z]*)$/i;
const MASTERY_TOKEN_RE = /^Token:athena_s\d+_spritemastery_token_q(\d+)([a-z]*)$/i;

// Step letters are globally consistent across every released sprite
// (verified against all 15 mapped chains in real data: sprites even skip
// exactly the letters of styles they lack). Lets us name caught variants on
// chains with no redeem quests yet. A redeem-learned mapping still wins.
const STEP_LETTER_VARIANT = {
  "": "Normal", a: "Gummy", b: "Galaxy", c: "Gold",
  d: "Gem", e: "Holofoil", f: "Cube",
};

// Chain number → sprite slug seed (decoded from a real account). q16/q17 are
// Air/Seven by elimination (flip if in-game order differs); chains with
// progress but no known sprite surface via `unknownChains`. Redeem quests
// override this at runtime.
const CHAIN_SEED = {
  1: "water", 2: "earth", 3: "fire", 4: "duck", 5: "ghost", 6: "dream",
  7: "demon", 8: "punk", 9: "king", 10: "theburntpeanut", 11: "zeropoint",
  12: "fishy", 13: "striker", 14: "aura", 15: "boss", 16: "air",
  17: "seven", 18: "grimreaper",
};

const IGNORED_TEMPLATES =
  /^(ChallengeBundle:|ChallengeBundleSchedule:|Quest:quest_daily_)/i;

export const MASTERED = "mastered";
export const FOUND = "found";
export const MISSING = "missing";

function parseVtid(vtid) {
  const m = VTID_RE.exec(vtid);
  if (!m) return null;
  const parts = m[1].toLowerCase().split("_");
  const last = parts[parts.length - 1];
  const variant = STYLE_SUFFIXES[last];
  const slug = (variant ? parts.slice(0, -1) : parts).join("_");
  return { slug, variant: variant || "Normal" };
}

// items: the /api/sync `items` array.
// Returns {
//   mastered:      { [slug]: { [variant]: true } },  // backbling — crown
//   found:         { [slug]: { [variant]: true } },  // auto signals (< mastered)
//   unknownChains: { [chain]: count },               // caught, sprite unknown
//   unmapped:      [{ templateId, note, via }] }
export function buildCollection(items) {
  const mastered = {};
  const found = {};
  const unmapped = [];
  const seenUnmapped = new Set();
  const chainSlug = { ...CHAIN_SEED };
  const chainSteps = {}; // chain → Set of step letters seen (from tokens)
  const stepVariant = {}; // chain → letter → variant (learned from redeems)

  const surface = (templateId, note, via) => {
    const key = `${templateId}|${note}`;
    if (seenUnmapped.has(key)) return;
    seenUnmapped.add(key);
    unmapped.push({ templateId, note, via });
  };

  const mark = (bucket, slug, variant) => {
    const sprite = SLUG_LOOKUP[slug];
    if (!sprite || !sprite.variants[variant]) return false;
    (bucket[sprite.slug] ||= {})[variant] = true;
    return true;
  };

  for (const item of items || []) {
    const templateId = String(item.templateId || "");

    // Backbling coldtrophy owned tags → MASTERED (the pod style only unlocks
    // once the variant is mastered).
    if (BACKPACK_RE.test(templateId)) {
      const channels =
        item.attributes?.variants || item.attributes?.cosmetic_variants || [];
      for (const ch of Array.isArray(channels) ? channels : []) {
        for (const rawTag of ch?.owned || []) {
          const tag = String(rawTag).split(".").pop().toLowerCase();
          if (tag === "mat0") continue; // the empty pod itself
          const hit = FILE_LOOKUP[tag];
          if (hit) mark(mastered, hit.sprite.slug, hit.variant);
          else surface(`${templateId} style ${rawTag}`, MASTERED, item.profileId);
        }
      }
      continue;
    }

    // A possessed variant token → FOUND (you have the style, mastered or not).
    if (VTID_RE.test(templateId)) {
      const parsed = parseVtid(templateId);
      if (!mark(found, parsed.slug, parsed.variant))
        surface(templateId, FOUND, item.profileId);
      continue;
    }

    // Redeem quests: a Claimed one granted its variant token → FOUND. Every
    // redeem also teaches chain→sprite and step→variant for naming.
    if (templateId.startsWith("Quest:")) {
      const rewards = item.attributes?.premium_rewards?.rewards || [];
      const claimed = item.attributes?.quest_state === "Claimed";
      const redeem = REDEEM_QUEST_RE.exec(templateId);
      for (const r of rewards) {
        const parsed = parseVtid(String(r.templateId || ""));
        if (!parsed) continue; // token/other reward — season plumbing
        if (redeem) {
          const sprite = SLUG_LOOKUP[parsed.slug];
          if (sprite) {
            const chain = Number(redeem[1]);
            chainSlug[chain] = sprite.slug;
            (stepVariant[chain] ||= {})[redeem[2] || ""] = parsed.variant;
          }
        }
        if (claimed && !mark(found, parsed.slug, parsed.variant))
          surface(r.templateId, FOUND, templateId);
      }
      continue;
    }

    // Mastery token → a caught creature → FOUND. Resolve variant after the
    // loop, once every redeem has taught its mapping.
    const token = MASTERY_TOKEN_RE.exec(templateId);
    if (token) {
      (chainSteps[Number(token[1])] ||= new Set()).add(token[2] || "");
      continue;
    }

    if (IGNORED_TEMPLATES.test(templateId)) continue;
    if (templateId.startsWith("Token:")) continue; // other season tokens
    surface(templateId, null, item.profileId);
  }

  // Resolve caught-creature tokens → found variants; chains we can't name yet
  // (new collab sprites) surface separately.
  const unknownChains = {};
  for (const [chain, steps] of Object.entries(chainSteps)) {
    const slug = chainSlug[chain];
    if (!slug) {
      unknownChains[chain] = steps.size;
      continue;
    }
    for (const letter of steps) {
      const variant = stepVariant[chain]?.[letter] ?? STEP_LETTER_VARIANT[letter];
      if (variant) mark(found, slug, variant);
    }
  }

  // MASTERED supersedes FOUND — don't double-list a variant.
  for (const [slug, vs] of Object.entries(mastered)) {
    if (!found[slug]) continue;
    for (const variant of Object.keys(vs)) delete found[slug][variant];
    if (!Object.keys(found[slug]).length) delete found[slug];
  }

  return { mastered, found, unknownChains, unmapped };
}

// Slim item codec for the cached sync report: keeps localStorage small but
// preserves everything buildCollection reads, so the app can RE-PARSE the
// last sync with the current parser on every load.
export function slimItem(item) {
  const a = item.attributes || {};
  const slim = { t: item.templateId, p: item.profileId };
  if (a.quest_state) slim.q = a.quest_state;
  if (typeof a.level === "number") slim.l = a.level;
  if (a.variants) slim.v = a.variants;
  if (a.premium_rewards?.rewards)
    slim.r = a.premium_rewards.rewards.map((r) => r.templateId);
  return slim;
}

export function expandSlimItems(slim) {
  return (slim || []).map((i) => ({
    templateId: i.t,
    profileId: i.p,
    attributes: {
      ...(i.q ? { quest_state: i.q } : {}),
      ...(typeof i.l === "number" ? { level: i.l } : {}),
      ...(i.v ? { variants: i.v } : {}),
      ...(i.r
        ? { premium_rewards: { rewards: i.r.map((t) => ({ templateId: t })) } }
        : {}),
    },
  }));
}

const countBucket = (bucket) =>
  Object.values(bucket || {}).reduce((n, vs) => n + Object.keys(vs).length, 0);

export const countMastered = (c) => countBucket(c?.mastered);
export const countFound = (c) => countBucket(c?.found);
