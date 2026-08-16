"use client";

// Create a trade room: pick the player count, get one link, share it.
// If the creator arrived from the signed-in tracker (/room?p=<their code>)
// they're dropped into their own room already joined.

import { useEffect, useState } from "react";
import { MAX_ROUND_PLAYERS } from "../../lib/trade-round.js";
import { rememberHost, rememberMe } from "./room-session.js";

const SIZES = Array.from({ length: MAX_ROUND_PLAYERS - 1 }, (_, i) => i + 2);

export default function StartRoom() {
  const [size, setSize] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [mine, setMine] = useState(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("p");
    if (p) setMine(decodeURIComponent(p));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the room.");

      const code = data.room.code;
      rememberHost(code, data.host);

      // Arrived from the tracker with a collection in hand — take the seat
      // rather than making them upload their own image to their own room.
      if (mine) {
        const join = await fetch(`/api/room/${code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionCode: mine }),
        });
        const joined = await join.json();
        if (join.ok) {
          const me = joined.room.players.find((p) => p.code === mine);
          if (me) rememberMe(code, me.name);
        }
      }
      window.location.href = `/room/${code}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="hud">
        <div className="acct">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
          <span className="pub-badge">no sign-in needed</span>
        </div>
        <h1 className="pub-title">Trade room</h1>
      </header>

      <p className="tr-blurb">
        Everyone trading gets <b>one link</b>. Each player opens it and drops
        in their collection — as an image straight from the tracker, or by
        pasting their code. Trades appear as soon as two people are in and
        re-plan every time somebody joins.
      </p>

      <div className="room-setup">
        <div className="section-label">How many players?</div>
        <div className="chips">
          {SIZES.map((n) => (
            <button
              key={n}
              className={`chip ${size === n ? "on" : ""}`}
              aria-pressed={size === n}
              onClick={() => setSize(n)}
            >
              {n} players
            </button>
          ))}
        </div>
        {mine && (
          <p className="field-hint">
            Your collection comes with you — you&rsquo;ll already be in the room.
          </p>
        )}
        <button className="btn-sync" disabled={busy} onClick={start}>
          {busy ? "Starting…" : "Start the room"}
        </button>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="pub-cta">
        <div className="section-label">Just want a one-off round?</div>
        <p>
          If you already have everyone&rsquo;s codes in front of you, skip the
          room and plan it in one go.
        </p>
        <a className="btn-step" href="/trade">
          Plan a round from codes
        </a>
      </div>

      <p className="fineprint">
        A room holds only display names and collection codes — the same strings
        people paste into group chats — and deletes itself 20 minutes after the
        last player joins, or the moment you mark it complete. Fan-made tool,
        not affiliated with Epic Games.
      </p>
    </main>
  );
}
