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

export async function POST() {
  const session = openSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "signed_out" }, { status: 401 });
  }

  try {
    const token = await tokenFromDeviceAuth(session);

    const results = [];
    const profileErrors = [];
    for (const profileId of PROFILE_IDS) {
      const res = await queryProfile(token.access_token, session.a, profileId);
      if (res.ok) results.push(extractSpriteData(res.data, profileId));
      else profileErrors.push({ profileId, status: res.status, error: res.error });
    }

    const items = results.flatMap((r) => r.items);
    const attributes = results.flatMap((r) => r.attributes);

    return Response.json({
      syncedAt: new Date().toISOString(),
      displayName: session.n,
      items,
      attributes,
      profileErrors,
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
