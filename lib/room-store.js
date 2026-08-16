// Shared state for trade rooms — the one thing in this app that isn't
// computed from a URL.
//
// A room has to outlive a single visit (players arrive at different times and
// each needs to see what the others uploaded), so it can't be stateless like
// /s/<code> and /trade. What's held is deliberately minimal and short-lived:
// display names and collection codes — the same strings people already paste
// into group chats — never Epic tokens, account ids, or anything from a
// session cookie. Redis does the expiry itself, so a finished room deletes
// without a sweeper.
//
// Talks the Upstash REST protocol with plain fetch, which is what both Vercel
// KV and Upstash Redis speak — no client library, in keeping with the rest of
// the repo. With no credentials configured it falls back to an in-process Map
// so `npm run dev` works offline; that fallback is per-instance and therefore
// dev-only (it says so out loud on first use).

import { decodeCode } from "./share.js";
import { MAX_ROUND_PLAYERS } from "./trade-round.js";

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasStore = Boolean(REST_URL && REST_TOKEN);

// A room that never fills would otherwise sit forever; this is the outer
// safety net, not the lifetime people care about.
const WAITING_TTL_S = 12 * 60 * 60;
// "Active until 20 minutes after all images are added."
export const FULL_TTL_S = 20 * 60;

const key = (code) => `sl:room:${code}`;

/* ---------------- transport ---------------- */

// Hung off globalThis, not module scope: Next compiles each route into its
// own module instance, so a plain `new Map()` here would give /api/room and
// /api/room/[code] separate stores and every freshly created room would read
// back as closed.
const memory = (globalThis.__spriteLedgerRooms ||= new Map()); // code -> { value, expiresAt }
let warned = false;

function memoryWarn() {
  if (warned) return;
  warned = true;
  console.warn(
    "[trade rooms] No KV credentials — using an in-memory store. Fine for " +
      "local dev; set KV_REST_API_URL/KV_REST_API_TOKEN (Vercel KV) or " +
      "UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN before deploying."
  );
}

async function command(args) {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`store: ${body.error}`);
  return body.result;
}

async function get(code) {
  if (!hasStore) {
    memoryWarn();
    const hit = memory.get(code);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      memory.delete(code);
      return null;
    }
    return JSON.parse(hit.value);
  }
  const raw = await command(["GET", key(code)]);
  return raw ? JSON.parse(raw) : null;
}

async function put(code, room, ttlS) {
  const value = JSON.stringify(room);
  if (!hasStore) {
    memoryWarn();
    memory.set(code, { value, expiresAt: Date.now() + ttlS * 1000 });
    return true;
  }
  await command(["SET", key(code), value, "EX", ttlS]);
  return true;
}

// Only creates — never overwrites a live room, which is what makes the
// collision retry in createRoom safe.
async function putIfAbsent(code, room, ttlS) {
  const value = JSON.stringify(room);
  if (!hasStore) {
    memoryWarn();
    const hit = memory.get(code);
    if (hit && hit.expiresAt > Date.now()) return false;
    memory.set(code, { value, expiresAt: Date.now() + ttlS * 1000 });
    return true;
  }
  return (await command(["SET", key(code), value, "EX", ttlS, "NX"])) !== null;
}

async function drop(code) {
  if (!hasStore) {
    memory.delete(code);
    return;
  }
  await command(["DEL", key(code)]);
}

/* ---------------- room codes ---------------- */

// No O/0/I/1 — these get read aloud and retyped off a phone screen.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LEN = 5;

export const isRoomCode = (s) =>
  typeof s === "string" && new RegExp(`^[${ALPHABET}]{${ROOM_CODE_LEN}}$`).test(s);

function randomFrom(alphabet, len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  // Rejection-free because 256 % 32 === 0 — the alphabet is exactly 32 chars.
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const hostToken = () =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/* ---------------- room shape ---------------- */

// What every caller outside this module sees. `host` never leaves here.
export function publicRoom(room) {
  return {
    code: room.code,
    size: room.size,
    players: room.players.map((p) => ({ name: p.name, code: p.code })),
    status: room.players.length >= room.size ? "full" : "waiting",
    // Present only once the room is full — that's when the clock starts.
    expiresAt: room.fullAt ? room.fullAt + FULL_TTL_S * 1000 : null,
  };
}

export function isHost(room, token) {
  return Boolean(token) && room.host === token;
}

/* ---------------- operations ---------------- */

export async function createRoom(size) {
  const n = Number(size);
  if (!Number.isInteger(n) || n < 2 || n > MAX_ROUND_PLAYERS)
    throw new Error(`A room holds 2 to ${MAX_ROUND_PLAYERS} players.`);

  const host = hostToken();
  // Codes are short enough to collide eventually; NX means a clash never
  // clobbers somebody's live room, it just costs another attempt.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomFrom(ALPHABET, ROOM_CODE_LEN);
    const room = {
      v: 1,
      code,
      size: n,
      host,
      players: [],
      createdAt: Date.now(),
      fullAt: null,
    };
    if (await putIfAbsent(code, room, WAITING_TTL_S)) return { room, host };
  }
  throw new Error("Couldn't start a room just now — try again.");
}

export async function readRoom(code) {
  if (!isRoomCode(code)) return null;
  return get(code);
}

// A display name has to survive being read aloud and shown on a trade card, and
// two people in a room must never share one — the roster name is how every
// other operation addresses a player.
const cleanName = (raw) => String(raw || "").replace(/\s+/g, " ").trim().slice(0, 20);

function uniqueName(players, wanted, ignoreIndex = -1) {
  const taken = new Set(
    players.filter((_, i) => i !== ignoreIndex).map((p) => p.name)
  );
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; n < 50; n++) if (!taken.has(`${wanted} (${n})`)) return `${wanted} (${n})`;
  return `${wanted} ${Date.now()}`;
}

/**
 * Add a player, or refresh one already in the room.
 *
 * Anyone holding the link can do this for anyone else — one person can fill
 * the whole roster from their own phone — so identity comes from the COLLECTION
 * CODE, not the display name. Two friends whose codes both fall back to
 * "Guardian" are two players; the same code uploaded twice is one player whose
 * upload was corrected. Getting that backwards would silently merge two people
 * into one seat.
 *
 * `displayName` overrides the name inside the code, which is how you name
 * somebody who isn't holding the phone.
 */
export async function joinRoom(code, collectionCode, displayName) {
  const room = await readRoom(code);
  if (!room) throw new Error("That room has closed — ask for a new link.");

  // Validate here, not just in the browser: the room is shared, so one bad
  // entry would break the round for everybody.
  const fromCode = decodeCode(collectionCode);
  const wanted = cleanName(displayName) || fromCode.name;

  const players = [...room.players];
  const existing = players.findIndex((p) => p.code === collectionCode);
  const at = Date.now();

  if (existing >= 0) {
    players[existing] = {
      ...players[existing],
      name: uniqueName(players, wanted, existing),
      code: collectionCode,
      at,
    };
  } else if (players.length >= room.size) {
    throw new Error(`This room is full (${room.size} players).`);
  } else {
    players.push({ name: uniqueName(players, wanted), code: collectionCode, at });
  }

  const wasFull = Boolean(room.fullAt);
  const nowFull = players.length >= room.size;
  const next = {
    ...room,
    players,
    // The 20-minute clock starts when the last player lands and is not
    // restarted by someone re-uploading afterwards.
    fullAt: wasFull ? room.fullAt : nowFull ? Date.now() : null,
  };
  await put(code, next, nowFull ? FULL_TTL_S : WAITING_TTL_S);
  return next;
}

// Rename a player already in the room — how you fix a name you typed for
// somebody else, or replace an Epic display name nobody recognises.
export async function renameInRoom(code, from, to) {
  const room = await readRoom(code);
  if (!room) return null;
  const at = room.players.findIndex((p) => p.name === from);
  if (at < 0) throw new Error("That player has already left the room.");

  const wanted = cleanName(to);
  if (!wanted) throw new Error("A player needs a name.");

  const players = [...room.players];
  players[at] = { ...players[at], name: uniqueName(players, wanted, at) };
  // Renaming touches no seat, so the room's clock and TTL stay exactly as
  // they were.
  await put(code, { ...room, players }, room.fullAt ? FULL_TTL_S : WAITING_TTL_S);
  return { ...room, players };
}

export async function leaveRoom(code, name) {
  const room = await readRoom(code);
  if (!room) return null;
  const players = room.players.filter((p) => p.name !== name);
  // Dropping below the size reopens the room; the clock resets when it
  // fills again, which is the behaviour someone removing a bad upload wants.
  const next = { ...room, players, fullAt: players.length >= room.size ? room.fullAt : null };
  await put(code, next, next.fullAt ? FULL_TTL_S : WAITING_TTL_S);
  return next;
}

export async function completeRoom(code) {
  await drop(code);
}
