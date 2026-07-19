// Turns raw synced Epic profile items into per-sprite variant ownership.
//
// The signal: "spritemastery_redeem" quests. Each one's premium reward is a
// CosmeticVariantToken:vtid_backpack_coldtrophy_<slug>[_<style>], and the
// quest_state tells you where the player stands:
//   Claimed → they redeemed the sprite variant (OWNED)
//   Active  → the quest exists but isn't done (PENDING — visible, not owned)
// Variants with no redeem quest yet (later season phases) stay "unseen".
//
// Everything else in the sync (mastery quests rewarding Token:..., the
// Token items themselves, ChallengeBundle/Schedule scaffolding, daily
// vending-gate quests) is season plumbing, not ownership — skipped silently.
// Sprite-ish items we *can't* classify are returned in `unmapped` so new
// season content surfaces in the UI instead of being dropped.

import { SLUG_LOOKUP, STYLE_SUFFIXES } from "./catalog.js";

const VTID_RE = /^CosmeticVariantToken:vtid_backpack_coldtrophy_(.+)$/i;

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

  const record = (slug, variant, state) => {
    const sprite = SLUG_LOOKUP[slug];
    if (!sprite || !sprite.variants[variant]) return false;
    const cur = (variants[sprite.slug] ||= {});
    // A variant can appear in several quests; owned wins over pending.
    if (cur[variant] !== OWNED) cur[variant] = state;
    return true;
  };

  for (const item of items || []) {
    const templateId = String(item.templateId || "");

    if (templateId.startsWith("Quest:")) {
      const rewards = item.attributes?.premium_rewards?.rewards || [];
      const state =
        item.attributes?.quest_state === "Claimed" ? OWNED : PENDING;
      for (const r of rewards) {
        const parsed = parseVtid(String(r.templateId || ""));
        if (!parsed) continue; // token/other reward — season plumbing
        if (!record(parsed.slug, parsed.variant, state)) {
          const key = `${r.templateId}|${state}`;
          if (!seenUnmapped.has(key)) {
            seenUnmapped.add(key);
            unmapped.push({ templateId: r.templateId, state, via: templateId });
          }
        }
      }
      continue;
    }

    if (IGNORED_TEMPLATES.test(templateId)) continue;

    // Anything else sprite-flavored that we don't understand — surface it.
    if (!seenUnmapped.has(templateId)) {
      seenUnmapped.add(templateId);
      unmapped.push({ templateId, state: null, via: item.profileId });
    }
  }

  return { variants, unmapped };
}

export function countOwned(collection) {
  let n = 0;
  for (const vs of Object.values(collection?.variants || {}))
    for (const state of Object.values(vs)) if (state === OWNED) n++;
  return n;
}
