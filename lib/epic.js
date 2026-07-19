// Server-side helpers for Epic's (undocumented) Fortnite services.
// Auth model: each user pastes a one-time authorization code from Epic's web
// login; we exchange it, mint a per-account device auth, and seal it into the
// user's own encrypted cookie. Console players sign in the same way — Epic's
// web login offers PlayStation / Xbox / Nintendo sign-in for linked accounts.
//
// These are community-documented endpoints, not an official public API.
// Read-only personal use; Epic can change them at any time.

const AUTH_HOST =
  process.env.EPIC_AUTH_HOST ||
  "https://account-public-service-prod.ol.epicgames.com";
const FN_HOST =
  process.env.EPIC_FN_HOST ||
  "https://fortnite-public-service-prod11.ol.epicgames.com";

// Public Fortnite game client used for the community auth-code flow. Epic
// disabled fortniteIOSGameClient (3446cd72...) in 2026 — its token endpoint
// now returns errors.com.epicgames.account.client_disabled — so we default to
// fortniteAndroidGameClient, which is still enabled and behaves identically
// (authorization_code + device_auth grants, Fortnite profile access). This is
// the client the maintained rebootpy library ships today.
//
// If Epic disables this one too, override via env (no redeploy of code needed).
// Verified-enabled fallbacks with the required device_auth grant (2026-07):
//   fortniteNewIOSGameClient  af43dc71dd91452396fcdffbd7a8e8a9 : 4YXvSEBLFRPLh1hzGZAkfOi5mqupFohZ
// Do NOT use fortnitePCGameClient — still enabled but Epic dropped its
// device_auth grant, which this app relies on to reuse sign-ins.
// Live status trackers: egs.jaren.wtf, github.com/Jaren8r/EpicClients.
//
// The value must match the clientId in the redirect URL on the client
// (NEXT_PUBLIC_EPIC_CLIENT_ID). These are not secrets — they're constants
// embedded in the shipped game binaries.
// Client registry. Each sign-in records which client minted its device auth
// (session.c) so the ongoing silent re-auth redeems it with the same client.
//   android — default for the manual auth-code (copy/paste) flow.
//   switch  — fortniteNewSwitchGameClient, the one enabled client that also
//             supports Epic's device-code flow (the seamless "log in and
//             confirm" login). Its secret is dashed — that's intentional.
// All three carry device_auth + Fortnite profile access.
const CLIENTS = {
  android: {
    id: process.env.EPIC_CLIENT_ID || "3f69e56c7649492c8cc29f1af08a8a12",
    secret: process.env.EPIC_CLIENT_SECRET || "b51ee9cb12234f50a69efa67ef53812e",
  },
  switch: {
    id: process.env.EPIC_SWITCH_CLIENT_ID || "98f7e42c2e3a4f86a74eb43fbb41ed39",
    secret:
      process.env.EPIC_SWITCH_CLIENT_SECRET ||
      "0a2449a2-001a-451e-afec-3e812901c4d7",
  },
};

// The client used for the device-code flow (must support deviceAuthorization).
export const DEVICE_CLIENT = "switch";

function basicFor(clientKey) {
  const c = CLIENTS[clientKey] || CLIENTS.android;
  return Buffer.from(`${c.id}:${c.secret}`).toString("base64");
}

// clientId embedded in the copy/paste redirect URL on the client.
export const EPIC_CLIENT_ID = CLIENTS.android.id;
const CLIENT_BASIC = basicFor("android");

export class EpicError extends Error {
  constructor(friendly, { status = 502, code, detail } = {}) {
    super(friendly);
    this.friendly = friendly;
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

async function epicFetch(url, init) {
  let res;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch (e) {
    throw new EpicError(
      "Couldn't reach Epic's servers. Check your connection and try again.",
      { detail: String(e) }
    );
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new EpicError(
      `Epic returned an unexpected response (${res.status}). They may be having issues — try again in a minute.`,
      { status: 502, detail: text.slice(0, 160) }
    );
  }
  return { res, data };
}

function friendly(data, fallback) {
  const code = data?.errorCode || "";
  if (code.includes("authorization_code_not_found") || code.includes("code_not_found"))
    return "That code was already used or expired. Codes are single-use — go back to step 2 and grab a fresh one.";
  if (code.includes("invalid_grant") || code.includes("device_auth"))
    return "Epic no longer accepts this sign-in (it may have been revoked). Please sign in again.";
  if (code.includes("throttled") || code.includes("rate_limit"))
    return "Epic is rate-limiting requests right now. Wait a minute and try again.";
  return data?.errorMessage || fallback;
}

export async function exchangeAuthCode(code) {
  const { res, data } = await epicFetch(`${AUTH_HOST}/account/api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `basic ${CLIENT_BASIC}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code }),
  });
  if (!res.ok)
    throw new EpicError(friendly(data, "Epic rejected that code."), {
      status: 400,
      code: data?.errorCode,
    });
  return data; // { access_token, account_id, displayName, ... }
}

// --- Device-code flow (seamless "log in and confirm" sign-in) ---

async function clientCredentialsToken(clientKey) {
  const { res, data } = await epicFetch(`${AUTH_HOST}/account/api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `basic ${basicFor(clientKey)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok)
    throw new EpicError(friendly(data, "Couldn't reach Epic sign-in."), {
      code: data?.errorCode,
    });
  return data.access_token;
}

// Kicks off a device authorization: returns the user_code to show, the
// verification URL to send the user to, the device_code to poll with, and
// the poll interval. Epic ties the completed login to the device_code.
export async function startDeviceAuthorization() {
  const cc = await clientCredentialsToken(DEVICE_CLIENT);
  const { res, data } = await epicFetch(
    `${AUTH_HOST}/account/api/oauth/deviceAuthorization`,
    {
      method: "POST",
      headers: {
        Authorization: `bearer ${cc}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ prompt: "login" }),
    }
  );
  if (!res.ok)
    throw new EpicError(friendly(data, "Couldn't start Epic sign-in."), {
      code: data?.errorCode,
    });
  return data; // { user_code, device_code, verification_uri[_complete], interval, expires_in }
}

// Polls once. { pending: true } while the user hasn't confirmed yet;
// { token } once they have; throws (400) when the request has expired.
export async function pollDeviceCode(deviceCode) {
  const { res, data } = await epicFetch(`${AUTH_HOST}/account/api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `basic ${basicFor(DEVICE_CLIENT)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "device_code",
      device_code: deviceCode,
    }),
  });
  if (res.ok) return { token: data };
  const code = data?.errorCode || "";
  if (code.includes("authorization_pending") || code.includes("slow_down"))
    return { pending: true };
  if (code.includes("expired"))
    throw new EpicError(
      "That sign-in request expired. Tap sign in to get a fresh one.",
      { status: 400, code }
    );
  throw new EpicError(friendly(data, "Epic sign-in failed."), {
    status: 400,
    code,
  });
}

export async function tokenFromDeviceAuth({ d: deviceId, a: accountId, s: secret, c }) {
  const { res, data } = await epicFetch(`${AUTH_HOST}/account/api/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `basic ${basicFor(c || "android")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "device_auth",
      device_id: deviceId,
      account_id: accountId,
      secret,
    }),
  });
  if (!res.ok) {
    const revoked =
      (data?.errorCode || "").includes("invalid_grant") ||
      (data?.errorCode || "").includes("device_auth");
    throw new EpicError(
      revoked
        ? "Your Epic sign-in was revoked or expired. Please sign in again."
        : friendly(data, "Epic sign-in failed."),
      { status: revoked ? 401 : 502, code: data?.errorCode }
    );
  }
  return data;
}

export async function createDeviceAuth(accessToken, accountId) {
  const { res, data } = await epicFetch(
    `${AUTH_HOST}/account/api/public/account/${accountId}/deviceAuth`,
    {
      method: "POST",
      headers: {
        Authorization: `bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
  if (!res.ok)
    throw new EpicError(friendly(data, "Couldn't finish signing in with Epic."), {
      code: data?.errorCode,
    });
  return data; // { deviceId, accountId, secret }
}

export async function deleteDeviceAuth(accessToken, accountId, deviceId) {
  try {
    await fetch(
      `${AUTH_HOST}/account/api/public/account/${accountId}/deviceAuth/${deviceId}`,
      {
        method: "DELETE",
        headers: { Authorization: `bearer ${accessToken}` },
        cache: "no-store",
      }
    );
  } catch {
    // best-effort cleanup; sign-out proceeds regardless
  }
}

export async function queryProfile(accessToken, accountId, profileId) {
  const url = `${FN_HOST}/fortnite/api/game/v2/profile/${accountId}/client/QueryProfile?profileId=${profileId}&rvn=-1`;
  const { res, data } = await epicFetch(url, {
    method: "POST",
    headers: {
      Authorization: `bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return { ok: false, status: res.status, error: data?.errorMessage || data };
  return { ok: true, data };
}

// "sprite" catches the mastery/redeem quests; "coldtrophy" catches what they
// award — the owned CosmeticVariantToken:vtid_backpack_coldtrophy_* items and
// the Sprite Mastery Pod backpack itself (whose variant list is the ground
// truth for owned styles). Filtering only on /sprite/i silently dropped every
// owned token, which made sprites acquired outside quest flow look missing.
const SPRITE_RE = /sprite|coldtrophy/i;

export function extractSpriteData(profileResponse, sourceProfileId) {
  const out = { items: [], attributes: [] };
  const profile = profileResponse?.profileChanges?.[0]?.profile;
  if (!profile) return out;

  for (const [itemId, item] of Object.entries(profile.items || {})) {
    const templateId = item.templateId || "";
    if (SPRITE_RE.test(templateId)) {
      out.items.push({
        itemId,
        templateId,
        quantity: item.quantity ?? 1,
        attributes: item.attributes || {},
        profileId: sourceProfileId,
      });
    }
  }
  for (const [key, value] of Object.entries(profile.stats?.attributes || {})) {
    if (SPRITE_RE.test(key)) out.attributes.push({ key, value, profileId: sourceProfileId });
  }
  return out;
}
