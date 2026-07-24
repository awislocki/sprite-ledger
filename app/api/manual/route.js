import { cookies } from "next/headers";
import { MANUAL_KEYS } from "../../../lib/catalog";

export const dynamic = "force-dynamic";

// Back up the user's manual tile toggles in a long-lived SERVER-SET cookie.
// Nothing is stored on the server — the cookie lives only in the browser.
// The point of the round-trip: cookies set via Set-Cookie (unlike anything
// script-writable, localStorage included) are exempt from Safari ITP's
// 7-day eviction, so toggles survive indefinitely on iPhones; each save
// refreshes the 400-day clock (the browser maximum).
const COOKIE = "sl_manual";
const CODES = { missing: "m", found: "f", mastered: "M" };

export async function POST(req) {
  let body = null;
  try {
    body = await req.json();
  } catch {}
  const accountId =
    typeof body?.accountId === "string" ? body.accountId.slice(0, 64) : "";
  const manual =
    body?.manual && typeof body.manual === "object" && !Array.isArray(body.manual)
      ? body.manual
      : null;
  if (!manual || !/^[a-z0-9-]{1,64}$/i.test(accountId)) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  // Only real catalog keys with known states make it into the cookie.
  const pairs = [];
  for (const [key, val] of Object.entries(manual)) {
    if (MANUAL_KEYS.has(key) && CODES[val]) pairs.push(`${key}=${CODES[val]}`);
  }
  const jar = await cookies();
  jar.set(COOKIE, `v1.${accountId}.${pairs.join("~")}`, {
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    path: "/",
    httpOnly: false, // the client reads it back when localStorage is gone
    secure: process.env.NODE_ENV === "production",
  });
  return Response.json({ ok: true, saved: pairs.length });
}
