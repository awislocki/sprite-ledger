// Codec for the manual-toggle backup cookie (see app/api/manual/route.js).
//
// Format: "v1.<accountId>.<key>=<code>~<key>=<code>~…" with codes
// m=missing (suppresses a wrong Epic auto-found), f=found, M=mastered.
// Compact on purpose: this rides in a cookie, and cookies are capped at
// ~4KB — blow the cap and the browser drops it SILENTLY, losing the whole
// backup. 98 catalog keys ≈ 1.4KB today, so there's headroom, but the guard
// keeps a future catalog from quietly breaking persistence.
//
// Pairs are sorted so the same map always encodes to the same string —
// that's what lets the client skip redundant network writes.

import { MANUAL_KEYS } from "./catalog.js";

export const MANUAL_COOKIE = "sl_toggles";
// Shipped 2026-07-24 at path=/ and NOT httpOnly. Same v1 payload, but it
// matches every request path, so leaving it in place would both shadow the
// scoped cookie above (same name → stale restores) and add ~1.4KB to every
// request for 400 days. The route reads it once for migration, then expires it.
export const LEGACY_COOKIE = "sl_manual";
export const MAX_COOKIE_BYTES = 3500;

const TO_CODE = { missing: "m", found: "f", mastered: "M" };
const TO_STATE = { m: "missing", f: "found", M: "mastered" };

// Epic account ids are hex; the mock uses a dashed slug. No dots — the
// encoding splits on them.
export const isAccountId = (s) => typeof s === "string" && /^[a-z0-9-]{1,64}$/i.test(s);

export function encodeManual(accountId, manual) {
  const pairs = [];
  for (const [key, val] of Object.entries(manual || {}))
    if (MANUAL_KEYS.has(key) && TO_CODE[val]) pairs.push(`${key}=${TO_CODE[val]}`);
  pairs.sort();
  let out = `v1.${accountId}.${pairs.join("~")}`;
  // Over budget: drop trailing pairs rather than lose everything.
  while (out.length > MAX_COOKIE_BYTES && pairs.length) {
    pairs.pop();
    out = `v1.${accountId}.${pairs.join("~")}`;
  }
  return out;
}

// Returns the decoded map, or null if the payload is junk or belongs to a
// different account (never silently mix accounts).
export function decodeManual(raw, accountId) {
  if (typeof raw !== "string") return null;
  const [ver, acct, ...rest] = raw.split(".");
  if (ver !== "v1" || !acct || acct !== accountId) return null;
  const body = rest.join(".");
  const out = {};
  for (const pair of body ? body.split("~") : []) {
    const [key, code] = pair.split("=");
    if (MANUAL_KEYS.has(key) && TO_STATE[code]) out[key] = TO_STATE[code];
  }
  return out;
}
