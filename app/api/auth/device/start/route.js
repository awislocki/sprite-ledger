import { startDeviceAuthorization, EpicError } from "../../../../../lib/epic";
import {
  requireSecret,
  sealSession,
  deviceSetCookie,
} from "../../../../../lib/session";
import { rateLimit, clientIp } from "../../../../../lib/ratelimit";

export const dynamic = "force-dynamic";

// Begins the seamless device-code login. Returns the user code to show and
// the Epic URL to send the user to; seals the device_code (never exposed to
// the browser) plus the poll pacing into a short-lived cookie for /poll.
export async function POST(request) {
  try {
    requireSecret();
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  // Unauthenticated endpoint that hits Epic — throttle scripted abuse.
  const rl = rateLimit(`dev-start:${clientIp(request)}`, {
    limit: 8,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return Response.json(
      { error: "Too many sign-in attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  try {
    const d = await startDeviceAuthorization();
    const intervalMs = Math.max(2, d.interval || 5) * 1000;
    const now = Date.now();
    const sealed = sealSession({
      dc: d.device_code,
      iv: intervalMs,
      na: now + Math.floor(intervalMs * 0.75), // earliest next poll
    });
    return Response.json(
      {
        userCode: d.user_code,
        verificationUri: d.verification_uri,
        verificationUriComplete: d.verification_uri_complete,
        interval: d.interval || 5,
        expiresIn: d.expires_in || 600,
      },
      { headers: { "Set-Cookie": deviceSetCookie(sealed) } }
    );
  } catch (err) {
    if (err instanceof EpicError)
      return Response.json({ error: err.friendly }, { status: err.status });
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
