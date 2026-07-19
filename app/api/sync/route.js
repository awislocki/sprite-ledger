import { cookies } from "next/headers";
import {
  openSession,
  SESSION_COOKIE,
  sessionClearCookie,
} from "../../../lib/session";
import {
  tokenFromDeviceAuth,
  queryProfile,
  extractSpriteData,
  EpicError,
} from "../../../lib/epic";

export const dynamic = "force-dynamic";

// Sprites are new enough that Epic could store them under athena (BR profile)
// or collections (collection-book progress) — scan both and merge.
const PROFILE_IDS = ["athena", "collections"];

// Compact recon of a raw QueryProfile response: how sprite/mastery data is
// shaped in each profile, so we can find things the main extractor misses
// (per-variant mastery LEVEL isn't in the athena tokens — all read level 1 —
// and brand-new sprites may live under different templateIds). Surfaced in
// the sync report, not used for display.
function profileDebug(data) {
  const prof = data?.profileChanges?.[0]?.profile;
  if (!prof) return null;
  const items = Object.values(prof.items || {});
  const rx = /sprite|coldtrophy|mastery/i;
  const sprite = items
    .filter((i) => rx.test(i.templateId || ""))
    .map((i) => ({
      t: i.templateId,
      q: i.quantity,
      l: i.attributes?.level,
      ak: Object.keys(i.attributes || {}).filter((k) => k !== "level"),
    }));

  // Structural overview: how many items of each templateId namespace
  // (the part before ":"). Reveals what KINDS of records exist.
  const namespaces = {};
  for (const i of items) {
    const ns = String(i.templateId || "").split(":")[0] || "?";
    namespaces[ns] = (namespaces[ns] || 0) + 1;
  }

  // Collab sprites award their OWN backbling, not a ColdTrophy variant — so
  // capture EVERY backpack that carries a cosmetic-variant channel (the
  // pod-like discriminator) plus its owned-style tags. A separate Batman/
  // Vini pod would surface here even though it never matches /sprite/.
  const variantBackpacks = items
    .filter(
      (i) =>
        /^AthenaBackpack:/i.test(i.templateId || "") &&
        Array.isArray(i.attributes?.variants) &&
        i.attributes.variants.length
    )
    .map((i) => ({
      t: i.templateId,
      channels: i.attributes.variants.map((v) => ({
        c: v.channel,
        active: v.active,
        owned: (v.owned || []).length,
        // the actual owned tags — small enough, and this is the ownership list
        tags: v.owned || [],
      })),
    }));

  // Any standalone CosmeticVariantToken items (a collab sprite might grant a
  // non-coldtrophy variant token we currently ignore).
  const variantTokens = items
    .filter((i) => /^CosmeticVariantToken:/i.test(i.templateId || ""))
    .map((i) => i.templateId);

  return {
    itemCount: items.length,
    namespaces,
    statAttrKeys: Object.keys(prof.stats?.attributes || {}),
    spriteItemCount: sprite.length,
    variantBackpacks,
    variantTokens,
    // Any sprite item whose level or quantity is above 1 — the mastery signal
    // we're hunting for, if it exists anywhere.
    leveled: sprite.filter((s) => (s.l && s.l > 1) || (s.q && s.q > 1)),
    // Distinct attribute-key sets seen on sprite items (dedup by join).
    attrShapes: [...new Set(sprite.map((s) => s.ak.sort().join(",")).filter(Boolean))],
  };
}

export async function POST() {
  const session = openSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "signed_out" }, { status: 401 });
  }

  try {
    const token = await tokenFromDeviceAuth(session);

    const results = [];
    const profileErrors = [];
    const debug = {};
    for (const profileId of PROFILE_IDS) {
      const res = await queryProfile(token.access_token, session.a, profileId);
      if (res.ok) {
        results.push(extractSpriteData(res.data, profileId));
        debug[profileId] = profileDebug(res.data);
      } else {
        profileErrors.push({ profileId, status: res.status, error: res.error });
      }
    }

    const items = results.flatMap((r) => r.items);
    const attributes = results.flatMap((r) => r.attributes);

    return Response.json({
      syncedAt: new Date().toISOString(),
      displayName: session.n,
      items,
      attributes,
      profileErrors,
      debug,
      empty: items.length === 0 && attributes.length === 0,
    });
  } catch (err) {
    if (err instanceof EpicError) {
      const headers =
        err.status === 401 ? { "Set-Cookie": sessionClearCookie() } : {};
      return Response.json(
        { error: err.friendly, code: err.code },
        { status: err.status, headers }
      );
    }
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
