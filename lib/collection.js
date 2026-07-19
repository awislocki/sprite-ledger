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

const IGNORED_TEMPLATES =
  /^(Token:|ChallengeBundle:|ChallengeBundleSchedule:|Quest:quest_daily_)/i;

export const OWNED = "owned";
export const PENDING = "pending";

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
//           unmapped: [{ templateId, state, via }] }
export function buildCollection(items) {
  const variants = {};
  const unmapped = [];
  const seenUnmapped = new Set();

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

    // 3. Redeem quests: Claimed → owned, Active → pending.
    if (templateId.startsWith("Quest:")) {
      const rewards = item.attributes?.premium_rewards?.rewards || [];
      const state =
        item.attributes?.quest_state === "Claimed" ? OWNED : PENDING;
      for (const r of rewards) {
        const parsed = parseVtid(String(r.templateId || ""));
        if (!parsed) continue; // token/other reward — season plumbing
        if (!record(parsed.slug, parsed.variant, state))
          surface(r.templateId, state, templateId);
      }
      continue;
    }

    if (IGNORED_TEMPLATES.test(templateId)) continue;

    // Anything else sprite-flavored that we don't understand — surface it.
    surface(templateId, null, item.profileId);
  }

  return { variants, unmapped };
}

export function countOwned(collection) {
  let n = 0;
  for (const vs of Object.values(collection?.variants || {}))
    for (const state of Object.values(vs)) if (state === OWNED) n++;
  return n;
}
