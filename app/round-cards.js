"use client";

// The visual round: swap cards and chain cards. Shared by the one-off planner
// (/trade) and the live trade room (/room/<code>) so a round looks identical
// wherever it's shown — and matches the share image.

import { spriteImage } from "../lib/catalog.js";

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

export default function RoundCards({ round }) {
  const name = (i) => round.players[i].name;
  return (
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
          {round.sitOut.map(name).join(", ")} sat out — no one here has a Sprite
          they still need.
        </div>
      )}
    </div>
  );
}
