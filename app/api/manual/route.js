import { cookies } from "next/headers";
import {
  MANUAL_COOKIE,
  LEGACY_COOKIE,
  encodeManual,
  decodeManual,
  isAccountId,
} from "../../../lib/manual";

export const dynamic = "force-dynamic";

// Durable backup of the user's manual tile toggles. Nothing is stored on the
// server — the payload is echoed straight back as a cookie that lives only
// in the user's browser. The round-trip exists because cookies set via
// Set-Cookie (unlike anything script-writable, localStorage included) are
// exempt from Safari ITP's 7-day eviction, so toggles survive indefinitely
// on iPhones. Every save refreshes the 400-day clock (the browser maximum).
//
// The cookie is httpOnly and scoped to THIS path: it is never attached to
// page loads, sprite images, or /api/sync (it would add ~1.4KB to every one
// of those), and script on the page can't read or forge it. The client gets
// it back via GET.
const COOKIE_OPTS = {
  maxAge: 60 * 60 * 24 * 400,
  sameSite: "lax",
  path: "/api/manual",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

export async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {}
  const accountId = body?.accountId;
  const manual = body?.manual;
  if (
    !isAccountId(accountId) ||
    !manual ||
    typeof manual !== "object" ||
    Array.isArray(manual)
  ) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const value = encodeManual(accountId, manual);
  const jar = await cookies();
  jar.set(MANUAL_COOKIE, value, COOKIE_OPTS);
  // Retire the 2026-07-24 root-path cookie once its data is safely rewritten.
  if (jar.get(LEGACY_COOKIE)) jar.set(LEGACY_COOKIE, "", { path: "/", maxAge: 0 });
  return Response.json({ ok: true, bytes: value.length });
}

// Restore path: hand back the decoded map for this account (or an empty one
// when there's no backup / it belongs to a different account).
export async function GET(req) {
  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!isAccountId(accountId))
    return Response.json({ error: "bad request" }, { status: 400 });
  const jar = await cookies();
  // Prefer the scoped cookie; fall back to the legacy one so users who
  // toggled before the rename don't lose their backup.
  const restored =
    decodeManual(jar.get(MANUAL_COOKIE)?.value, accountId) ||
    decodeManual(jar.get(LEGACY_COOKIE)?.value, accountId);
  return Response.json({ manual: restored || {} });
}
