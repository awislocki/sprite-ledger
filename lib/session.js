// Encrypted session cookie: each user's Epic device auth is sealed with
// AES-256-GCM using SESSION_SECRET and stored httpOnly in their own browser.
// The server holds no user data at rest — no database required.

import crypto from "crypto";

export const SESSION_COOKIE = "sl_session";
export const DEVICE_COOKIE = "sl_dc"; // holds the sealed device_code mid-login
const MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const DEVICE_MAX_AGE = 60 * 15; // device_code lives ~10 min at Epic

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function requireSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it in Vercel (Project Settings > Environment Variables), then redeploy."
    );
  }
}

export function sealSession(payload) {
  requireSecret();
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

export function openSession(token) {
  try {
    const key = getKey();
    if (!key || !token) return null;
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString("utf8"));
  } catch {
    return null; // tampered, stale secret, or garbage — treat as signed out
  }
}

const secureFlag = () =>
  process.env.NODE_ENV === "production" ? " Secure;" : "";

export function sessionSetCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly;${secureFlag()} SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function sessionClearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secureFlag()} SameSite=Lax; Max-Age=0`;
}

// The device_code is sealed (never exposed to the browser) and held in its
// own short-lived cookie while the user confirms the login at Epic.
export function deviceSetCookie(value) {
  return `${DEVICE_COOKIE}=${value}; Path=/; HttpOnly;${secureFlag()} SameSite=Lax; Max-Age=${DEVICE_MAX_AGE}`;
}

export function deviceClearCookie() {
  return `${DEVICE_COOKIE}=; Path=/; HttpOnly;${secureFlag()} SameSite=Lax; Max-Age=0`;
}
