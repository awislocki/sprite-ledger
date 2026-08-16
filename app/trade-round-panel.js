"use client";

// "Trade round" — paste a few friends' collection codes and the app works
// out a round where EVERY player hands over one sprite and receives one they
// don't have, then renders it as a single image for the group chat.

import { useMemo, useState } from "react";
import { spriteImage } from "../lib/catalog.js";
import { decodeCode } from "../lib/share.js";
import {
  planTradeRound,
  roundSummaryText,
  MAX_ROUND_PLAYERS,
} from "../lib/trade-round.js";
import { renderTradeRoundImage } from "../lib/trade-image.js";
import { shareOrDownload } from "../lib/share-image.js";

const label = (variant) => (variant === "Normal" ? "Base" : variant);

function SpriteTile({ trade }) {
  return (
    <span className={`vtile vv-${trade.variant.toLowerCase()}`}>
      <span className="vtile-img">
        <img
          src={trade.sprite ? spriteImage(trade.sprite, trade.variant) : ""}
          alt=""
          width={48}
          height={48}
          loading="lazy"
        />
      </span>
    </span>
  );
}

// Variant above name, the same reading order as the share image.
function GiftName({ trade }) {
  return (
    <span className="tr-gift-name">
      <i>{label(trade.variant)}</i>
      <b>{trade.sprite?.name || trade.key}</b>
    </span>
  );
}

function SwapSide({ trade, name }) {
  return (
    <div className="tr-side">
      <strong>{name(trade.from)}</strong>
      <small>hands over</small>
      <SpriteTile trade={trade} />
      <GiftName trade={trade} />
    </div>
  );
}

// One hand-off in a chain. The tile sits left of a two-line column so long
// Epic display names get the full width instead of being clipped to "Dark_…".
function ChainHop({ trade, name }) {
  return (
    <div className="tr-line">
      <SpriteTile trade={trade} />
      <span className="tr-hop">
        <span className="tr-hop-names">
          <span>{name(trade.from)}</span>
          <i aria-hidden="true">→</i>
          <span>{name(trade.to)}</span>
        </span>
        <GiftName trade={trade} />
      </span>
    </div>
  );
}

export default function TradeRoundPanel({ mine, displayName, toast }) {
  const [guests, setGuests] = useState([]); // [{ name, owned, code }]
  const [input, setInput] = useState("");
  const [addError, setAddError] = useState(null);
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);

  // Re-planned from live state, so a re-sync or a tile tap never leaves a
  // stale round on screen.
  const { round, planError } = useMemo(() => {
    if (guests.length === 0) return { round: null, planError: null };
    try {
      const players = [
        { name: displayName || "You", owned: mine },
        ...guests.map((g) => ({ name: g.name, owned: g.owned })),
      ];
      return { round: planTradeRound(players, { seed }), planError: null };
    } catch (err) {
      return { round: null, planError: err.message };
    }
  }, [mine, displayName, guests, seed]);

  function addPlayer() {
    setAddError(null);
    let decoded;
    try {
      decoded = decodeCode(input);
    } catch (err) {
      setAddError(err.message);
      return;
    }
    if (guests.length + 1 >= MAX_ROUND_PLAYERS) {
      setAddError(
        `A round tops out at ${MAX_ROUND_PLAYERS} players — run a second round for the rest.`
      );
      return;
    }
    if (guests.some((g) => g.name === decoded.name)) {
      setAddError(`${decoded.name} is already in this round.`);
      return;
    }
    setGuests([...guests, { ...decoded, code: input.trim() }]);
    setInput("");
  }

  async function shareImage() {
    setBusy(true);
    try {
      const blob = await renderTradeRoundImage({
        round,
        label: new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      });
      const result = await shareOrDownload(
        blob,
        "fmds-trade-round.png",
        "FMDS trade round"
      );
      if (result === "downloaded") toast("Round image saved to your downloads.");
    } catch (err) {
      toast(`Couldn't make the image: ${err.message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function copyText() {
    const text = roundSummaryText(round);
    try {
      await navigator.clipboard.writeText(text);
      toast("Round copied — paste it into the group chat.");
    } catch {
      window.prompt("Copy the round:", text);
    }
  }

  const name = (i) => round.players[i].name;

  return (
    <div className="trade-round">
      <div className="section-label">Trade round</div>
      <p className="tr-blurb">
        Add everyone's collection codes and we'll work out a round where
        everybody hands over one sprite and gets one they're missing.
      </p>

      <div className="share-compare-row">
        <input
          id="round-code"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setAddError(null);
          }}
          placeholder="FMDS1.TheirName.xxxx"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="btn-step"
          disabled={!input.trim()}
          onClick={addPlayer}
        >
          Add player
        </button>
      </div>
      {addError && (
        <div className="alert" role="alert">
          {addError}
        </div>
      )}

      <div className="tr-roster">
        <span className="tr-player you">{displayName || "You"}</span>
        {guests.map((g, i) => (
          <span className="tr-player" key={`${g.name}-${i}`}>
            {g.name}
            <button
              aria-label={`Remove ${g.name}`}
              onClick={() => setGuests(guests.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {planError && (
        <div className="alert" role="alert">
          {planError}
        </div>
      )}

      {round && round.trades.length === 0 && (
        <div className="mini-empty">
          Nobody here can help anybody yet — everyone's holding the same
          sprites. Add another player.
        </div>
      )}

      {round && round.trades.length > 0 && (
        <>
          <div className="tr-cards">
            {round.circles.map((circle, ci) => (
              <div className="tr-card" key={ci}>
                {circle.players.length === 2 ? (
                  <>
                    <span className="tr-tag">Straight swap</span>
                    <div className="tr-swap">
                      <SwapSide trade={circle.trades[0]} name={name} />
                      <span className="tr-swap-icon" aria-hidden="true">
                        ⇄
                      </span>
                      <SwapSide trade={circle.trades[1]} name={name} />
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tr-tag">
                      Chain · {circle.players.length} players · pass it round
                    </span>
                    {circle.trades.map((t) => (
                      <ChainHop key={t.from} trade={t} name={name} />
                    ))}
                  </>
                )}
              </div>
            ))}
            {round.sitOut.length > 0 && (
              <div className="mini-empty">
                {round.sitOut.map(name).join(", ")} sat out — no one here has a
                sprite they still need.
              </div>
            )}
          </div>

          <div className="share-actions">
            <button className="btn-step" disabled={busy} onClick={shareImage}>
              {busy ? "Rendering…" : "🖼 Share round image"}
            </button>
            <button className="btn-step" onClick={() => setSeed(seed + 1)}>
              🎲 Re-roll the round
            </button>
            <button className="btn-step" onClick={copyText}>
              📋 Copy as text
            </button>
          </div>
        </>
      )}
    </div>
  );
}
