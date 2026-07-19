import { cookies } from "next/headers";
import {
  pollDeviceCode,
  exchangeToClient,
  createDeviceAuth,
  EpicError,
} from "../../../../../lib/epic";
import {
  openSession,
  sealSession,
  sessionSetCookie,
  DEVICE_COOKIE,
  deviceSetCookie,
  deviceClearCookie,
} from "../../../../../lib/session";
import { rateLimit, clientIp } from "../../../../../lib/ratelimit";

export const dynamic = "force-dynamic";

// Polled by the client until the user confirms at Epic. While pending,
// returns { status: "pending" }. On success, mints a device auth (same as
// the copy/paste login), seals the session cookie, and clears the temp
// device_code cookie. Poll spacing is enforced server-side (via the sealed
// cookie) so the endpoint can't be hammered even with a valid cookie.
export async function POST(request) {
  const jar = await cookies();
  const pending = openSession(jar.get(DEVICE_COOKIE)?.value);
  if (!pending?.dc) {
    return Response.json(
      { error: "Sign-in session expired. Tap sign in to start again." },
      { status: 400, headers: { "Set-Cookie": deviceClearCookie() } }
    );
  }

  // Backstop burst limiter (per instance) on top of the interval gate below.
  const rl = rateLimit(`dev-poll:${clientIp(request)}`, {
    limit: 40,
    windowMs: 60_000,
  });
  if (!rl.ok) return Response.json({ status: "pending" });

  // Honor Epic's poll interval on the server — a too-early poll is answered
  // "pending" without touching Epic, keeping request volume minimal.
  const now = Date.now();
  if (pending.na && now < pending.na) {
    return Response.json({ status: "pending" });
  }

  try {
    const result = await pollDeviceCode(pending.dc);
    if (result.pending) {
      // Re-arm the interval gate for the next poll.
      const resealed = sealSession({
        dc: pending.dc,
        iv: pending.iv,
        na: now + (pending.iv || 5000),
      });
      return Response.json(
        { status: "pending" },
        { headers: { "Set-Cookie": deviceSetCookie(resealed) } }
      );
    }

    // The device-code (switch) token can't create device auths — exchange it
    // for an android token, which has that permission, then mint the auth so
    // it's created and later redeemed by the same (android) client.
    const token = await exchangeToClient(result.token.access_token, "android");
    const da = await createDeviceAuth(token.access_token, token.account_id);
    const session = {
      d: da.deviceId,
      a: da.accountId,
      s: da.secret,
      n: token.displayName || result.token.displayName || "Epic player",
      c: "android",
    };

    const headers = new Headers();
    headers.append("Set-Cookie", sessionSetCookie(sealSession(session)));
    headers.append("Set-Cookie", deviceClearCookie());
    return Response.json(
      { status: "complete", displayName: session.n, accountId: session.a },
      { headers }
    );
  } catch (err) {
    if (err instanceof EpicError) {
      // Expired/failed device codes are dead — clear the temp cookie so the
      // next attempt starts clean.
      return Response.json(
        { error: err.friendly, code: err.code },
        { status: err.status, headers: { "Set-Cookie": deviceClearCookie() } }
      );
    }
    return Response.json(
      { error: String(err.message || err) },
      { status: 500, headers: { "Set-Cookie": deviceClearCookie() } }
    );
  }
}
