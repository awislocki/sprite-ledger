// Trade-round planner tests. Run: npm test
//
// The planner's contract is what the whole feature rests on: every player in
// the round gives exactly one sprite and receives exactly one they don't
// already have. These assertions check that invariant on hand-built
// collections where the right answer is obvious.
import assert from "node:assert/strict";
import {
  planTradeRound,
  roundSummaryText,
  MAX_ROUND_PLAYERS,
} from "../lib/trade-round.js";
import { ALL_KEYS } from "../lib/catalog.js";

const player = (name, keys) => ({ name, owned: new Set(keys) });

// Every trade hands over something the giver has and the receiver doesn't,
// and each player appears exactly once as a giver and once as a receiver.
function assertSound(round, label) {
  const gave = new Set();
  const got = new Set();
  for (const t of round.trades) {
    const from = round.players[t.from];
    const to = round.players[t.to];
    assert.notEqual(t.from, t.to, `${label}: nobody trades with themselves`);
    assert.ok(from.owned.has(t.key), `${label}: ${from.name} owns ${t.key}`);
    assert.ok(!to.owned.has(t.key), `${label}: ${to.name} needs ${t.key}`);
    assert.ok(!gave.has(t.from), `${label}: ${from.name} gives only once`);
    assert.ok(!got.has(t.to), `${label}: ${to.name} receives only once`);
    gave.add(t.from);
    got.add(t.to);
  }
  assert.deepEqual([...gave].sort(), [...got].sort(), `${label}: givers == receivers`);
  // Circles cover exactly the traders; everyone else is explicitly sat out.
  const inCircles = round.circles.flatMap((c) => c.players);
  assert.deepEqual(inCircles.sort(), [...gave].sort(), `${label}: circles == traders`);
  assert.deepEqual(
    [...inCircles, ...round.sitOut].sort((a, b) => a - b),
    round.players.map((_, i) => i),
    `${label}: every player either trades or sits out`
  );
  for (const c of round.circles)
    assert.equal(c.trades.length, c.players.length, `${label}: one gift per player in a circle`);
}

/* ---- Two players: a straight swap ---- */

const swap = planTradeRound([
  player("Adam", ["fire:Normal", "fire:Gold"]),
  player("Jake", ["water:Normal", "water:Gold"]),
]);
assertSound(swap, "swap");
assert.equal(swap.trades.length, 2, "both players trade");
assert.equal(swap.circles.length, 1);
assert.deepEqual(swap.circles[0].players.length, 2, "a two-player circle");
assert.equal(swap.sitOut.length, 0);

/* ---- Rarer + closer-to-complete gifts win ---- */

// Jake has four of Duck's five variants; Adam holds the fifth plus a base
// nobody's near completing. The Duck gift both completes a row and is rarer,
// so it's the one the planner picks.
const chooser = planTradeRound([
  player("Adam", ["duck:Gem", "ghost:Normal"]),
  player("Jake", ["duck:Normal", "duck:Gold", "duck:Gummy", "duck:Galaxy", "king:Normal"]),
]);
assertSound(chooser, "chooser");
assert.equal(
  chooser.trades.find((t) => t.from === 0).key,
  "duck:Gem",
  "gift that finishes a row beats a lone base"
);

/* ---- Three players where NO pair can swap directly ---- */

// A can only help B, B only C, C only A — no two-player swap exists, so the
// round has to be a three-player chain. This is the case that makes odd
// group sizes work at all.
const ring = planTradeRound([
  player("A", ["fire:Normal", "water:Normal"]),
  player("B", ["water:Normal", "earth:Normal"]),
  player("C", ["earth:Normal", "fire:Normal"]),
]);
assertSound(ring, "ring");
assert.equal(ring.trades.length, 3, "all three trade");
assert.equal(ring.circles.length, 1);
assert.equal(ring.circles[0].players.length, 3, "one three-player chain");

/* ---- A player nobody can help sits out, the rest still trade ---- */

const everything = new Set(ALL_KEYS);
const stuck = planTradeRound([
  player("Adam", ["fire:Normal"]),
  player("Jake", ["water:Normal"]),
  { name: "Completionist", owned: everything },
]);
assertSound(stuck, "stuck");
assert.deepEqual(
  stuck.sitOut.map((i) => stuck.players[i].name),
  ["Completionist"],
  "someone who needs nothing sits out"
);
assert.equal(stuck.trades.length, 2, "the other two still swap");

// Two identical collections have nothing to offer each other: no trades, and
// the planner says so instead of inventing one.
const nothing = planTradeRound([
  player("Adam", ["fire:Normal"]),
  player("Jake", ["fire:Normal"]),
]);
assert.equal(nothing.trades.length, 0);
assert.deepEqual(nothing.sitOut, [0, 1]);

/* ---- Determinism and re-rolls ---- */

const roster = [
  player("Adam", ["fire:Normal", "fire:Gold", "duck:Gem", "punk:Galaxy"]),
  player("Jake", ["water:Normal", "water:Gold", "ghost:Holofoil"]),
  player("Sam", ["earth:Normal", "earth:Gold", "king:Gummy", "dream:Cube"]),
  player("Nora", ["boss:Normal", "aura:Gem", "striker:Gold"]),
];
const a = planTradeRound(roster);
const b = planTradeRound(roster);
assertSound(a, "roster");
assert.equal(a.trades.length, 4, "all four trade");
assert.deepEqual(
  a.trades.map((t) => `${t.from}>${t.to}:${t.key}`),
  b.trades.map((t) => `${t.from}>${t.to}:${t.key}`),
  "same input, same round — seed 0 is deterministic"
);
// A re-roll must stay sound; over a handful of seeds it must also actually
// produce a different round (otherwise the button is a lie).
const rounds = new Set();
for (let seed = 1; seed <= 6; seed++) {
  const r = planTradeRound(roster, { seed });
  assertSound(r, `seed ${seed}`);
  assert.equal(r.trades.length, 4, `seed ${seed}: everyone still trades`);
  rounds.add(r.trades.map((t) => `${t.from}>${t.to}:${t.key}`).join("|"));
}
assert.ok(rounds.size > 1, "re-rolling produces different rounds");

/* ---- Names, guards, and the text summary ---- */

const dupes = planTradeRound([
  player("Adam", ["fire:Normal"]),
  player("Adam", ["water:Normal"]),
]);
assert.deepEqual(dupes.players.map((p) => p.name), ["Adam", "Adam (2)"], "names are unique");

// Keys from an older catalog would render as blank tiles — drop them at the
// door rather than planning a trade around art that doesn't exist.
const stale = planTradeRound([
  player("Adam", ["fire:Normal", "gonesprite:Gold"]),
  player("Jake", ["water:Normal"]),
]);
assertSound(stale, "stale");
assert.ok(!stale.trades.some((t) => t.key === "gonesprite:Gold"));

assert.equal(MAX_ROUND_PLAYERS, 4, "a round is a squad — 4 players max");
assert.throws(() => planTradeRound([player("Solo", ["fire:Normal"])]), /at least two/);
assert.throws(
  () =>
    planTradeRound(
      Array.from({ length: MAX_ROUND_PLAYERS + 1 }, (_, i) =>
        player(`P${i}`, [ALL_KEYS[i]])
      )
    ),
  /tops out/
);

const text = roundSummaryText(a);
assert.match(text, /FMDS trade round — 4 trades/);
assert.match(text, /sprite-ledger\.vercel\.app/);
for (const p of a.players) assert.ok(text.includes(p.name), `${p.name} is in the summary`);

// The full-house case has to finish fast — it's the worst search the planner
// can be handed (every player can give to every other).
const big = Array.from({ length: MAX_ROUND_PLAYERS }, (_, i) =>
  player(`P${i}`, ALL_KEYS.filter((_, k) => k % MAX_ROUND_PLAYERS === i))
);
const t0 = process.hrtime.bigint();
const full = planTradeRound(big);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
assertSound(full, "full house");
assert.equal(
  full.trades.length,
  MAX_ROUND_PLAYERS,
  `all ${MAX_ROUND_PLAYERS} trade`
);
assert.ok(ms < 2000, `planning a full house took ${ms.toFixed(0)}ms`);

console.log(
  `ok — trade rounds: ${a.trades.length}-player round, ` +
    `${rounds.size}/6 distinct re-rolls, full house in ${ms.toFixed(0)}ms`
);
