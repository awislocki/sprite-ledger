// Turns raw synced Epic profile items into per-sprite variant ownership.
//
// Ownership signals, strongest first:
//   1. Owned CosmeticVariantToken:vtid_backpack_coldtrophy_<slug>[_<style>]
//      items — Epic grants one per unlocked style, regardless of HOW it was
//      unlocked (quest, vending machine, later season phases). OWNED.
//   2. The Sprite Mastery Pod backpack item's own variant list
//      (attributes.variants[].owned tags like "Mat13"/"Stage26") — same
//      ground truth in a different encoding; parsed defensively. OWNED.
//   3. "spritemastery_redeem" quests: quest_state Claimed → OWNED,
//      Active → PENDING (visible, in progress, not owned yet).
//
// Season plumbing (mastery quests rewarding Token:..., the Token items,
// ChallengeBundle/Schedule scaffolding, daily vending-gate quests) is
// skipped silently. Sprite-ish items we can't classify are returned in
// `unmapped` so new season content surfaces in the UI instead of vanishing.

import { SLUG_LOOKUP, STYLE_SUFFIXES, FILE_LOOKUP } from "./catalog.js";

const VTID_RE = /^CosmeticVariantToken:vtid_backpack_coldtrophy_(.+)$/i;
const BACKPACK_RE = /^AthenaBackpack:.*coldtrophy/i;

// The numbered quest chains tie everything together: chain qNN belongs to
// one sprite, and each step letter within it is one VARIANT of that sprite
// ("" = base, then a/b/c/d/e in that sprite's style order). The redeem
// quest for a step names the exact variant in its reward, which teaches us
// the step → variant mapping from the player's own data. Each owned
// Token:..._token_qNN<letter> item is an owned variant CREATURE, and its
// `level` attribute is that variant's level — crown at level 5. Mastery
// is per-variant, not per-sprite.
const REDEEM_QUEST_RE = /^Quest:quest_s\d+_spritemastery_redeem_p\d+_q(\d+)([a-z]*)$/i;
const MASTERY_TOKEN_RE = /^Token:athena_s\d+_spritemastery_token_q(\d+)([a-z]*)$/i;

// Step letters are globally consistent across every released sprite
// (verified against all 15 mapped chains in real data, 2026-07-19 —
// sprites even skip exactly the letters of styles they lack, e.g. Ghost
// has no Gem and no "d" step). Lets us name caught variants on chains
// that have no redeem quests yet (Seven/Air). A redeem-learned mapping
// still wins over this table; unknown letters fall back to a bare
// "caught" count. Quack's letter is still unobserved.
const STEP_LETTER_VARIANT = {
  "": "Normal", a: "Gummy", b: "Galaxy", c: "Gold",
  d: "Gem", e: "Holofoil", f: "Cube",
};

// Chain-number → sprite slug seed, decoded from a real account
// (2026-07-19). q16/q17 are Air and Seven by elimination — the only two
// catalog sprites without a revealed chain — assigned in catalog order;
// UNVERIFIED which is which until a redeem quest names them (if in-game
// levels look swapped between Air and Seven, flip these two). Chains with
// progress but no known sprite (q19/q22/q23 — future drops with no pod
// styles yet) are reported via `unknownChains`. Dynamic mapping from the
// player's own redeem quests overrides this seed.
const CHAIN_SEED = {
  1: "water", 2: "earth", 3: "fire", 4: "duck", 5: "ghost", 6: "dream",
  7: "demon", 8: "punk", 9: "king", 10: "theburntpeanut", 11: "zeropoint",
  12: "fishy", 13: "striker", 14: "aura", 15: "boss", 16: "air",
  17: "seven", 18: "grimreaper",
};

const IGNORED_TEMPLATES =
  /^(Token:|ChallengeBundle:|ChallengeBundleSchedule:|Quest:quest_daily_)/i;

export const OWNED = "owned";
export const PENDING = "pending";
export const MASTERY_LEVEL = 5;

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
//   variants:      { [slug]: { [variantKey]: "owned"|"pending" } },
//   variantLevels: { [slug]: { [variantKey]: level } },  // crown at 5
//   caught:        { [slug]: n },  // owned variant creatures (token count)
//   unknownChains: { [chain]: n },
//   unmapped:      [{ templateId, state, via }] }
export function buildCollection(items) {
  const variants = {};
  const unmapped = [];
  const seenUnmapped = new Set();
  const chainSlug = { ...CHAIN_SEED }; // chain number → sprite slug
  const chainSteps = {}; // chain number → Set of step letters with signal
  const stepVariant = {}; // chain → letter → variant key (from redeems)
  const tokensRaw = []; // { chain, letter, level } — resolved after the loop

  const surface = (templateId, state, via) => {
    const key = `${templateId}|${state}`;
    if (seenUnmapped.has(key)) return;
    seenUnmapped.add(key);
    unmapped.push({ templateId, state, via });
  };

  const record = (slug, variant, state) => {
    const sprite = SLUG_LOOKUP[slug];
    if (!sprite || !sprite.variants[variant]) return false;
    const cur = (variants[sprite.slug] ||= {});
    if (cur[variant] !== OWNED) cur[variant] = state;
    return true;
  };

  for (const item of items || []) {
    const templateId = String(item.templateId || "");

    // 1. Owned variant tokens — definitive.
    if (VTID_RE.test(templateId)) {
      const parsed = parseVtid(templateId);
      if (!record(parsed.slug, parsed.variant, OWNED))
        surface(templateId, OWNED, item.profileId);
      continue;
    }

    // 2. The Mastery Pod backpack: its owned style tags are ground truth.
    if (BACKPACK_RE.test(templateId)) {
      const channels =
        item.attributes?.variants || item.attributes?.cosmetic_variants || [];
      for (const ch of Array.isArray(channels) ? channels : []) {
        for (const rawTag of ch?.owned || []) {
          // Tags arrive as "Mat13", sometimes namespaced ("Mesh.Mat13").
          const tag = String(rawTag).split(".").pop().toLowerCase();
          if (tag === "mat0") continue; // the empty pod itself
          const hit = FILE_LOOKUP[tag];
          if (hit) record(hit.sprite.slug, hit.variant, OWNED);
          else surface(`${templateId} style ${rawTag}`, OWNED, item.profileId);
        }
      }
      continue;
    }

    // 3. Redeem quests: Claimed → owned, Active → pending. Their chain
    //    number + reward slug also teaches us the qNN → sprite mapping.
    if (templateId.startsWith("Quest:")) {
      const rewards = item.attributes?.premium_rewards?.rewards || [];
      const claimed = item.attributes?.quest_state === "Claimed";
      const state = claimed ? OWNED : PENDING;
      const redeem = REDEEM_QUEST_RE.exec(templateId);
      for (const r of rewards) {
        const parsed = parseVtid(String(r.templateId || ""));
        if (!parsed) continue; // token/other reward — season plumbing
        if (!record(parsed.slug, parsed.variant, state))
          surface(r.templateId, state, templateId);
        else if (redeem) {
          const sprite = SLUG_LOOKUP[parsed.slug];
          if (sprite) {
            const chain = Number(redeem[1]);
            chainSlug[chain] = sprite.slug;
            (stepVariant[chain] ||= {})[redeem[2] || ""] = parsed.variant;
          }
        }
      }
      continue;
    }

    // Owned variant creatures: one token per owned variant, carrying its
    // level. Must run before the generic Token: ignore below.
    const token = MASTERY_TOKEN_RE.exec(templateId);
    if (token) {
      const chain = Number(token[1]);
      const letter = token[2] || "";
      (chainSteps[chain] ||= new Set()).add(letter);
      tokensRaw.push({
        chain,
        letter,
        level: Number(item.attributes?.level) || 1,
      });
      continue;
    }

    if (IGNORED_TEMPLATES.test(templateId)) continue;

    // Anything else sprite-flavored that we don't understand — surface it.
    surface(templateId, null, item.profileId);
  }

  // Resolve tokens now that every redeem quest has taught its mappings.
  // One creature per chain step — duplicate tokens don't double count.
  // Redeem-learned step mapping wins; the global letter table covers
  // chains without redeems; a letter neither knows stays a bare count.
  const variantLevels = {};
  const caught = {};
  const seenSteps = new Set();
  for (const { chain, letter, level } of tokensRaw) {
    const slug = chainSlug[chain];
    if (!slug) continue; // reported via unknownChains below
    if (!seenSteps.has(`${chain}:${letter}`)) {
      seenSteps.add(`${chain}:${letter}`);
      caught[slug] = (caught[slug] || 0) + 1;
    }
    const variant =
      stepVariant[chain]?.[letter] ?? STEP_LETTER_VARIANT[letter];
    if (variant && SLUG_LOOKUP[slug]?.variants[variant]) {
      const cur = (variantLevels[slug] ||= {});
      cur[variant] = Math.max(cur[variant] || 0, level);
    }
  }

  const unknownChains = {};
  for (const [chain, steps] of Object.entries(chainSteps)) {
    if (!chainSlug[chain] && steps.size > 0) unknownChains[chain] = steps.size;
  }

  return { variants, variantLevels, caught, unknownChains, unmapped };
}

export function countOwned(collection) {
  let n = 0;
  for (const vs of Object.values(collection?.variants || {}))
    for (const state of Object.values(vs)) if (state === OWNED) n++;
  return n;
}
