// Trade-room tests: the PNG code stamp that makes image upload lossless, and
// the room lifecycle (join, replace, fill, the 20-minute clock, complete).
// Runs against the in-memory store — no KV credentials needed. Run: npm test
import assert from "node:assert/strict";
import { readPngText, writePngText, FMDS_CODE_KEY } from "../lib/png-text.js";
import {
  createRoom,
  readRoom,
  joinRoom,
  renameInRoom,
  leaveRoom,
  completeRoom,
  publicRoom,
  isHost,
  isRoomCode,
  hasStore,
  FULL_TTL_S,
} from "../lib/room-store.js";
import { encodeCode } from "../lib/share.js";
import { planTradeRound, MAX_ROUND_PLAYERS } from "../lib/trade-round.js";

assert.equal(hasStore, false, "tests must run against the in-memory fallback");

/* ---- PNG stamping: an uploaded image decodes to the exact collection ---- */

// Smallest possible valid PNG: signature + IHDR + IDAT + IEND. Only the chunk
// framing matters here, so the pixel data can be nonsense.
function tinyPng() {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(Uint8Array.from(type, (c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    // CRC is not validated on read, and writePngText computes its own.
    return out;
  };
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", new Uint8Array(13)),
    chunk("IDAT", Uint8Array.from([1, 2, 3])),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const CODE = encodeCode(new Set(["fire:Normal", "duck:Gem"]), "Wadam1230");
const base = tinyPng();
assert.equal(readPngText(base, FMDS_CODE_KEY), null, "unstamped PNG has no code");

const stamped = writePngText(base, FMDS_CODE_KEY, CODE);
assert.equal(readPngText(stamped, FMDS_CODE_KEY), CODE, "stamp round-trips");
assert.equal(stamped.length, base.length + 12 + FMDS_CODE_KEY.length + 1 + CODE.length);
// The stamp must not disturb the image itself: every original byte is still
// there in order, with IEND still last.
assert.deepEqual(stamped.subarray(0, base.length - 12), base.subarray(0, base.length - 12));
assert.deepEqual(stamped.subarray(stamped.length - 12), base.subarray(base.length - 12));
assert.equal(readPngText(stamped, "something-else"), null, "keyword is matched exactly");
// Junk in must never throw — an upload can be any file the user picked.
assert.equal(readPngText(Uint8Array.from([1, 2, 3]), FMDS_CODE_KEY), null);
assert.equal(readPngText(new Uint8Array(0), FMDS_CODE_KEY), null);
assert.equal(readPngText(null, FMDS_CODE_KEY), null);
assert.throws(() => writePngText(Uint8Array.from([1, 2, 3]), "k", "v"), /not a PNG/);

/* ---- Room lifecycle ---- */

const codeFor = (name, keys) => encodeCode(new Set(keys), name);
const ADAM = codeFor("Adam", ["fire:Normal", "fire:Gold", "duck:Gem"]);
const JAKE = codeFor("Jake", ["water:Normal", "water:Gold"]);
const SAM = codeFor("Sam", ["earth:Normal", "king:Gummy"]);

const { room: fresh, host } = await createRoom(3);
assert.ok(isRoomCode(fresh.code), `room code shape: ${fresh.code}`);
assert.ok(isHost(fresh, host) && !isHost(fresh, "nope"), "host token gates control");
assert.deepEqual(publicRoom(fresh), {
  code: fresh.code,
  size: 3,
  players: [],
  status: "waiting",
  expiresAt: null,
});
// The host token must never ride along in what players are sent.
assert.ok(!JSON.stringify(publicRoom(fresh)).includes(host), "host token stays server-side");

const one = await joinRoom(fresh.code, ADAM);
assert.deepEqual(one.players.map((p) => p.name), ["Adam"]);
assert.equal(publicRoom(one).status, "waiting");
assert.equal(publicRoom(one).expiresAt, null, "clock hasn't started");

// Identity is the COLLECTION CODE, not the display name: re-sending the same
// code refreshes that player instead of seating them twice.
const again = await joinRoom(fresh.code, ADAM);
assert.deepEqual(again.players.map((p) => p.name), ["Adam"], "same code, one seat");

// A different code with the SAME name is a different person — two friends whose
// codes both fall back to "Guardian" must not collapse into one seat.
const ADAM_TWIN = codeFor("Adam", ["boss:Cube"]);
const twins = await joinRoom(fresh.code, ADAM_TWIN);
assert.equal(twins.players.length, 2, "same name, different code = two players");
assert.deepEqual(twins.players.map((p) => p.name), ["Adam", "Adam (2)"], "names stay unique");
await leaveRoom(fresh.code, "Adam (2)");

// Anyone can name a player who isn't holding the phone — the explicit name
// beats whatever is inside the code.
const named = await joinRoom(fresh.code, ADAM, "Adam on the couch");
assert.deepEqual(named.players.map((p) => p.name), ["Adam on the couch"], "explicit name wins");
assert.equal(named.players.length, 1, "renaming an existing code doesn't add a seat");
await renameInRoom(fresh.code, "Adam on the couch", "Adam");

const two = await joinRoom(fresh.code, JAKE);
assert.equal(two.players.length, 2);
assert.equal(publicRoom(two).expiresAt, null, "still filling, still no clock");

// Two players in is enough to propose a round — that's the whole point of
// updating as people arrive.
const partial = planTradeRound(
  two.players.map((p) => ({ name: p.name, owned: new Set() })),
  { seed: 0 }
);
assert.equal(partial.players.length, 2);

const full = await joinRoom(fresh.code, SAM);
assert.equal(publicRoom(full).status, "full");
const expiresAt = publicRoom(full).expiresAt;
assert.ok(expiresAt, "filling the room starts the 20-minute clock");
assert.ok(
  Math.abs(expiresAt - (Date.now() + FULL_TTL_S * 1000)) < 5000,
  "clock is 20 minutes from the last join"
);

// A late re-upload must not buy the room another 20 minutes.
const after = await joinRoom(fresh.code, ADAM);
assert.equal(publicRoom(after).expiresAt, expiresAt, "clock doesn't restart");

// One seat over the size is refused; refreshing an existing code is the
// exception, since it takes no new seat.
await assert.rejects(
  () => joinRoom(fresh.code, codeFor("Gatecrasher", ["boss:Cube"])),
  /full/
);

/* ---- Renaming ---- */

const renamed = await renameInRoom(fresh.code, "Jake", "Jake from work");
assert.deepEqual(
  renamed.players.map((p) => p.name),
  ["Adam", "Jake from work", "Sam"],
  "rename keeps position"
);
assert.equal(renamed.players[1].code, JAKE, "rename doesn't touch the collection");
// A rename takes no seat, so it must not disturb the clock.
assert.equal(publicRoom(renamed).expiresAt, expiresAt, "rename doesn't move the clock");
// Colliding with somebody else gets suffixed rather than merging two players.
const collided = await renameInRoom(fresh.code, "Jake from work", "Adam");
assert.deepEqual(collided.players.map((p) => p.name), ["Adam", "Adam (2)", "Sam"]);
await renameInRoom(fresh.code, "Adam (2)", "Jake");
await assert.rejects(() => renameInRoom(fresh.code, "Nobody", "Someone"), /already left/);
await assert.rejects(() => renameInRoom(fresh.code, "Jake", "   "), /needs a name/);

// Leaving reopens the room and stops the clock.
const short = await leaveRoom(fresh.code, "Sam");
assert.deepEqual(short.players.map((p) => p.name), ["Adam", "Jake"]);
assert.equal(publicRoom(short).expiresAt, null, "clock clears when a seat opens");
assert.equal(publicRoom(short).status, "waiting");

// Marking complete deletes the room immediately.
await completeRoom(fresh.code);
assert.equal(await readRoom(fresh.code), null, "complete removes the room");
await assert.rejects(() => joinRoom(fresh.code, ADAM), /closed/);

/* ---- Guards ---- */

await assert.rejects(() => createRoom(1), /2 to/);
await assert.rejects(() => createRoom(MAX_ROUND_PLAYERS + 1), /2 to/);
await assert.rejects(() => createRoom("lots"), /2 to/);
// A room can't be larger than a round can plan for.
const { room: biggest } = await createRoom(MAX_ROUND_PLAYERS);
assert.equal(biggest.size, MAX_ROUND_PLAYERS);
await completeRoom(biggest.code);

// Bad codes are rejected at the door, not stored for everyone to trip over.
const { room: guarded } = await createRoom(2);
await assert.rejects(() => joinRoom(guarded.code, "not-a-code"), /FMDS1/);
assert.deepEqual((await readRoom(guarded.code)).players, [], "nothing was stored");
await completeRoom(guarded.code);

assert.equal(await readRoom("nope"), null, "malformed room codes read as gone");
assert.ok(!isRoomCode("ABCDO") && !isRoomCode("ABC") && !isRoomCode(""), "no O/0/I/1");

console.log(
  `ok — trade rooms: stamp ${stamped.length - base.length}B, ` +
    `lifecycle + clock + guards clean`
);
