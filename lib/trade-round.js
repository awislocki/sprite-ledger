// Trade rounds — "everybody hands over one, everybody gets one".
//
// A round is a permutation of the players with NO fixed point: each player
// gives exactly one sprite to the next player in a circle and receives
// exactly one from the previous one. Two-player circles are straight swaps
// (the common case); longer circles are pass-it-round chains, and they're
// what lets an odd number of players all trade in the same round — and what
// rescues a group where no two people can help each other directly but
// A → B → C → A works.
//
// Nothing conflicts by construction: a player receives one gift, and a key
// they're being given is a key they don't have, so they can never be asked
// to give that same key away in the same round.
//
// Pure + framework-free so scripts/test-trade-round.mjs can run it in node.

import { SLUG_LOOKUP, VARIANT_ORDER, ALL_KEYS, spriteVariants } from "./catalog.js";

// The search enumerates derangements of the player set (8 players → 14,833
// orderings, milliseconds). It's also about as many trades as fit legibly in
// one phone-sized share image.
export const MAX_ROUND_PLAYERS = 8;

const KEY_ORDER = new Map(ALL_KEYS.map((k, i) => [k, i]));

export function keyParts(key) {
  const [slug, variant] = String(key).split(":");
  return { sprite: SLUG_LOOKUP[slug], variant };
}

// Later in VARIANT_ORDER = further along the mastery chain = harder to get,
// so a Cube is a better gift than another Base. No hand-tuned table: the
// catalog's own ordering is the ranking.
const rarity = (variant) => Math.max(0, VARIANT_ORDER.indexOf(variant)) * 0.6;

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// How good is `key` as a gift for `receiver`? Rarity, plus how close it takes
// them to finishing that sprite's row — the 5th variant of a sprite they have
// 4 of lands better than a lone base for a sprite they've never seen. The
// seeded jitter is what makes "re-roll" produce a genuinely different round
// instead of the same one; at seed 0 the plan is fully deterministic.
function giftScore(key, receiver, seed) {
  const { sprite, variant } = keyParts(key);
  if (!sprite) return -1;
  const all = spriteVariants(sprite);
  const has = all.filter((v) => receiver.owned.has(`${sprite.slug}:${v}`)).length;
  const progress = all.length > 1 ? has / (all.length - 1) : 1;
  const jitter = seed
    ? ((fnv(`${seed}|${receiver.name}|${key}`) % 1000) / 1000) * 2.5
    : 0;
  return progress * 4 + rarity(variant) + jitter;
}

// The best single sprite `giver` can hand `receiver`, or null when the
// receiver already has everything the giver does.
function bestGift(giver, receiver, seed) {
  let best = null;
  for (const key of giver.owned) {
    if (receiver.owned.has(key) || !KEY_ORDER.has(key)) continue;
    const score = giftScore(key, receiver, seed);
    const better =
      !best ||
      score > best.score ||
      // Ties break on catalog order so a round never depends on Set
      // iteration order.
      (score === best.score && KEY_ORDER.get(key) < KEY_ORDER.get(best.key));
    if (better) best = { key, score };
  }
  return best;
}

// Names are what the image and the text summary key off, so make them
// unique and non-empty before anything else runs.
function normalizePlayers(raw) {
  const seen = new Map();
  return raw.map((p, i) => {
    const base = String(p.name || "").trim() || `Player ${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const owned = new Set(
      [...(p.owned || [])].filter((k) => KEY_ORDER.has(k))
    );
    return { name: n > 1 ? `${base} (${n})` : base, owned, ownedCount: owned.size };
  });
}

// Highest-scoring derangement of `members` (indices into `gift`), or null if
// no complete circle exists over exactly this set of players.
function bestCircle(members, gift) {
  const m = members.length;
  const taken = new Array(m).fill(false);
  const pick = new Array(m);
  let best = null;
  const walk = (i, score) => {
    if (i === m) {
      if (!best || score > best.score) best = { score, next: pick.slice() };
      return;
    }
    for (let j = 0; j < m; j++) {
      if (taken[j] || j === i) continue;
      const g = gift[members[i]][members[j]];
      if (!g) continue;
      taken[j] = true;
      pick[i] = j;
      walk(i + 1, score + g.score);
      taken[j] = false;
    }
  };
  walk(0, 0);
  return best;
}

// Every subset of `n` players of exactly `size`, as index arrays.
function subsets(n, size) {
  const out = [];
  const build = (start, acc) => {
    if (acc.length === size) return out.push(acc.slice());
    for (let i = start; i < n; i++) {
      acc.push(i);
      build(i + 1, acc);
      acc.pop();
    }
  };
  build(0, []);
  return out;
}

/**
 * Plan one trade round.
 *
 * @param raw  [{ name, owned: Set<"slug:Variant"> }] — you first, by convention.
 * @param opts { seed } — bump the seed to re-roll a different valid round.
 * @returns { seed, players, circles, trades, sitOut } where `circles` are the
 *   swap/chain groups to render, `trades` is the same set flattened, and
 *   `sitOut` lists players who couldn't be fitted into any circle.
 */
export function planTradeRound(raw, { seed = 0 } = {}) {
  const players = normalizePlayers(raw || []);
  const n = players.length;
  if (n < 2)
    throw new Error("A trade round needs at least two players — add a friend's code.");
  if (n > MAX_ROUND_PLAYERS)
    throw new Error(
      `A round tops out at ${MAX_ROUND_PLAYERS} players — drop someone and run a second round.`
    );

  // The whole search runs off this pairwise matrix; scoring each pair once
  // keeps the derangement walk to plain arithmetic.
  const gift = players.map((g, i) =>
    players.map((r, j) => (i === j ? null : bestGift(g, r, seed)))
  );

  // Biggest circle wins: try every subset largest-first and stop at the first
  // size where a complete circle exists, keeping the best-scoring one.
  let solution = null;
  let members = null;
  for (let size = n; size >= 2 && !solution; size--) {
    for (const sub of subsets(n, size)) {
      const found = bestCircle(sub, gift);
      if (found && (!solution || found.score > solution.score)) {
        solution = found;
        members = sub;
      }
    }
  }
  if (!solution)
    return {
      seed,
      players,
      circles: [],
      trades: [],
      sitOut: players.map((_, i) => i),
    };

  // Who gives to whom, in global player indices.
  const givesTo = new Map();
  solution.next.forEach((j, i) => givesTo.set(members[i], members[j]));

  // Split the permutation into its circles so the renderer can draw a
  // two-player swap differently from a three-plus chain.
  const circles = [];
  const visited = new Set();
  for (const start of members) {
    if (visited.has(start)) continue;
    const ring = [];
    let at = start;
    while (!visited.has(at)) {
      visited.add(at);
      ring.push(at);
      at = givesTo.get(at);
    }
    circles.push({
      players: ring,
      trades: ring.map((from) => {
        const to = givesTo.get(from);
        const { key } = gift[from][to];
        const { sprite, variant } = keyParts(key);
        return { from, to, key, sprite, variant };
      }),
    });
  }
  // Longest circle first — the headline trade leads the image.
  circles.sort((a, b) => b.players.length - a.players.length);

  return {
    seed,
    players,
    circles,
    trades: circles.flatMap((c) => c.trades),
    sitOut: players.map((_, i) => i).filter((i) => !visited.has(i)),
  };
}

const gifted = (t) =>
  `${t.variant === "Normal" ? "Base" : t.variant} ${t.sprite?.name || t.key}`;

// Plain-text version of the round — pasteable straight into a group chat for
// anyone who'd rather read than open an image.
export function roundSummaryText(round) {
  const name = (i) => round.players[i].name;
  const lines = [`FMDS trade round — ${round.trades.length} trades`];
  for (const circle of round.circles) {
    if (circle.players.length === 2) {
      const [a, b] = circle.trades;
      lines.push(`• ${name(a.from)} ${gifted(a)}  ⇄  ${gifted(b)} ${name(b.from)}`);
    } else {
      lines.push(
        `• Chain: ${circle.trades
          .map((t) => `${name(t.from)} —${gifted(t)}→ ${name(t.to)}`)
          .join(", ")}`
      );
    }
  }
  for (const i of round.sitOut) lines.push(`• ${name(i)} sits this one out`);
  lines.push("sprite-ledger.vercel.app");
  return lines.join("\n");
}
