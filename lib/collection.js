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

// Mastery levels ride the numbered quest chains: mastery quest
// quest_s41_spritemastery_p01_q05a and redeem quest ..._redeem_p01_q05
// share a chain number, and the redeem quest's reward names the sprite —
// so qNN → sprite is derivable from the player's own data. Each Claimed
// mastery step (equivalently, each owned token_qNN[letter] item) is one
// level of progress; level 5 = mastered.
const REDEEM_QUEST_RE = /^Quest:quest_s\d+_spritemastery_redeem_p\d+_q(\d+)[a-z]?$/i;
const MASTERY_QUEST_RE = /^Quest:quest_s\d+_spritemastery_p\d+_q(\d+)([a-z]*)$/i;
const MASTERY_TOKEN_RE = /^Token:athena_s\d+_spritemastery_token_q(\d+)([a-z]*)$/i;

// Chain-number → sprite slug seed, decoded from a real account
// (2026-07-19). Chains observed with no redeem quest yet (q16 q17 q19 q22
// q23 — likely Air/Seven and later drops) stay unmapped until a redeem
// quest reveals them; dynamic mapping below overrides this seed.
const CHAIN_SEED = {
  1: "water", 2: "earth", 3: "fire", 4: "duck", 5: "ghost", 6: "dream",
  7: "demon", 8: "punk", 9: "king", 10: "theburntpeanut", 11: "zeropoint",
  12: "fishy", 13: "striker", 14: "aura", 15: "boss", 18: "grimreaper",
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
// Returns { variants: { [spriteSlug]: { [variantKey]: "owned"|"pending" } },
//           mastery:  { [spriteSlug]: level },   // claimed mastery steps
//           unmapped: [{ templateId, state, via }] }
export function buildCollection(items) {
  const variants = {};
  const unmapped = [];
  const seenUnmapped = new Set();
  const chainSlug = { ...CHAIN_SEED }; // chain number → sprite slug
  const chainSteps = {}; // chain number → Set of completed step letters

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
          if (sprite) chainSlug[Number(redeem[1])] = sprite.slug;
        }
      }
      const mastery = !redeem && MASTERY_QUEST_RE.exec(templateId);
      if (mastery && claimed)
        (chainSteps[Number(mastery[1])] ||= new Set()).add(mastery[2] || "");
      continue;
    }

    // Owned mastery tokens are the same completed steps in item form —
    // must be counted before the generic Token: ignore below.
    const token = MASTERY_TOKEN_RE.exec(templateId);
    if (token) {
      (chainSteps[Number(token[1])] ||= new Set()).add(token[2] || "");
      continue;
    }

    if (IGNORED_TEMPLATES.test(templateId)) continue;

    // Anything else sprite-flavored that we don't understand — surface it.
    surface(templateId, null, item.profileId);
  }

  const mastery = {};
  for (const [chain, steps] of Object.entries(chainSteps)) {
    const slug = chainSlug[chain];
    if (slug)
      mastery[slug] = Math.max(mastery[slug] || 0, steps.size);
  }

  return { variants, mastery, unmapped };
}

export function countOwned(collection) {
  let n = 0;
  for (const vs of Object.values(collection?.variants || {}))
    for (const state of Object.values(vs)) if (state === OWNED) n++;
  return n;
}
