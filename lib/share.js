// Shareable "collection codes": FMDS1.<name>.<base64url payload>
// Payload = 2-byte FNV-1a checksum of the catalog key order + ownership
// bitmap over ALL_KEYS (89 bits today). The checksum pins a code to the
// exact catalog it was made with: when Epic adds styles to an existing
// sprite, bit positions shift — the checksum turns that (and truncated or
// tampered codes) into a friendly "different version" error instead of a
// silently wrong decode. Codes are tiny (~35 chars), paste anywhere, and
// need no server.

import { ALL_KEYS } from "./catalog.js";
import { OWNED } from "./collection.js";

const MAGIC = "FMDS1";
const BITMAP_BYTES = Math.ceil(ALL_KEYS.length / 8);

// 16-bit FNV-1a over the canonical key order.
function catalogChecksum() {
  let h = 0x811c9dc5;
  const s = ALL_KEYS.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ (h >>> 16)) & 0xffff;
}

const sanitizeName = (name) =>
  String(name || "").replace(/[.\s]+/g, " ").trim().slice(0, 20) || "Guardian";

export function ownedKeySet(collection) {
  const set = new Set();
  for (const [slug, vs] of Object.entries(collection?.variants || {}))
    for (const [variant, state] of Object.entries(vs))
      if (state === OWNED) set.add(`${slug}:${variant}`);
  return set;
}

function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeCode(collection, displayName) {
  const owned = ownedKeySet(collection);
  const bytes = new Uint8Array(2 + BITMAP_BYTES);
  const ck = catalogChecksum();
  bytes[0] = ck & 0xff;
  bytes[1] = ck >> 8;
  ALL_KEYS.forEach((key, i) => {
    if (owned.has(key)) bytes[2 + (i >> 3)] |= 1 << (i & 7);
  });
  return `${MAGIC}.${sanitizeName(displayName)}.${toBase64Url(bytes)}`;
}

// Finds a code anywhere in pasted text (tolerates surrounding prose,
// trailing punctuation). Returns { name, owned: Set<"slug:Variant"> } or
// throws with a human message.
export function decodeCode(raw) {
  const m = new RegExp(`${MAGIC}\\.([^.\\s]{1,40})\\.([A-Za-z0-9_-]+)`).exec(
    String(raw || "")
  );
  if (!m)
    throw new Error(
      "That doesn't look like a collection code — it starts with FMDS1."
    );
  let bytes;
  try {
    bytes = fromBase64Url(m[2]);
  } catch {
    throw new Error("That code is damaged — ask your friend to copy it again.");
  }
  const ck = catalogChecksum();
  if (
    bytes.length !== 2 + BITMAP_BYTES ||
    (bytes[0] | (bytes[1] << 8)) !== ck
  )
    throw new Error(
      "That code was made with a different version of the tracker (or got cut off). Ask your friend to re-copy it here."
    );
  const owned = new Set();
  ALL_KEYS.forEach((key, i) => {
    if (bytes[2 + (i >> 3)] & (1 << (i & 7))) owned.add(key);
  });
  return { name: sanitizeName(m[1]), owned };
}

// What `mine` can offer `theirs`, and vice versa.
export function tradeDiff(mineOwned, theirsOwned) {
  const youOffer = [...mineOwned].filter((k) => !theirsOwned.has(k));
  const theyOffer = [...theirsOwned].filter((k) => !mineOwned.has(k));
  const order = new Map(ALL_KEYS.map((k, i) => [k, i]));
  const byCatalog = (a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9);
  return { youOffer: youOffer.sort(byCatalog), theyOffer: theyOffer.sort(byCatalog) };
}
