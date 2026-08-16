"use client";

// The trade-round planner, as a page anyone can open — no sign-in, no Epic
// call, nothing stored. Every player is just a collection code; the round is
// computed in the browser from those codes alone, which is what lets the whole
// group (including people who don't use the tracker) work from one link.

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeCode } from "../../lib/share.js";
import {
  planTradeRound,
  roundSummaryText,
  MAX_ROUND_PLAYERS,
} from "../../lib/trade-round.js";
import { renderTradeRoundImage } from "../../lib/trade-image.js";
import { shareOrDownload } from "../../lib/share-image.js";
import RoundCards from "../round-cards.js";

export default function TradePlanner() {
  const [players, setPlayers] = useState([]); // [{ name, owned, code }]
  const [input, setInput] = useState("");
  const [addError, setAddError] = useState(null);
  const [note, setNote] = useState(null);
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function say(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  // Codes can arrive in the link (?p=code,code) so a whole round is one URL.
  // Anything undecodable is reported rather than silently dropped.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("p");
    if (!raw) return;
    const loaded = [];
    const bad = [];
    for (const part of raw.split(",").slice(0, MAX_ROUND_PLAYERS)) {
      const code = decodeURIComponent(part).trim();
      if (!code) continue;
      try {
        loaded.push({ ...decodeCode(code), code });
      } catch {
        bad.push(code.slice(0, 14));
      }
    }
    if (loaded.length) setPlayers(loaded);
    if (bad.length)
      setNote(
        `Couldn't read ${bad.length} code${bad.length > 1 ? "s" : ""} from the link — they may be from an older version of the tracker. Paste ${bad.length > 1 ? "them" : "it"} again below.`
      );
  }, []);

  // Keep the URL in step with the roster so the address bar is always the
  // shareable version of what's on screen.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (players.length)
      url.searchParams.set("p", players.map((p) => encodeURIComponent(p.code)).join(","));
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url);
  }, [players]);

  const { round, planError } = useMemo(() => {
    if (players.length < 2) return { round: null, planError: null };
    try {
      return { round: planTradeRound(players, { seed }), planError: null };
    } catch (err) {
      return { round: null, planError: err.message };
    }
  }, [players, seed]);

  function addPlayer() {
    setAddError(null);
    let decoded;
    try {
      decoded = decodeCode(input);
    } catch (err) {
      setAddError(err.message);
      return;
    }
    if (players.length >= MAX_ROUND_PLAYERS) {
      setAddError(
        `A round is ${MAX_ROUND_PLAYERS} players max — remove someone, or run a second round for the rest.`
      );
      return;
    }
    if (players.some((p) => p.name === decoded.name)) {
      setAddError(`${decoded.name} is already in this round.`);
      return;
    }
    setPlayers([...players, { ...decoded, code: input.trim() }]);
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
      if (result === "downloaded") say("Round image saved to your downloads.");
    } catch (err) {
      say(`Couldn't make the image: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      say(done);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  const full = players.length >= MAX_ROUND_PLAYERS;

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
        <h1 className="pub-title">Trade round</h1>
      </header>

      <p className="tr-blurb">
        Paste everyone&rsquo;s collection codes — up to {MAX_ROUND_PLAYERS} —
        and we&rsquo;ll work out a round where <b>every player hands over one
        Sprite and gets one they&rsquo;re missing</b>. Then share it to the
        group chat as an image.
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
          disabled={full}
        />
        <button
          className="btn-step"
          disabled={!input.trim() || full}
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
      {note && <div className="alert" role="alert">{note}</div>}

      {players.length > 0 && (
        <div className="tr-roster">
          {players.map((p, i) => (
            <span className="tr-player" key={`${p.name}-${i}`}>
              {p.name}
              <button
                aria-label={`Remove ${p.name}`}
                onClick={() => setPlayers(players.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {players.length < 2 && (
        <div className="mini-empty">
          {players.length === 0
            ? "Add at least two players to plan a round."
            : "One more player and there's a round to plan."}
        </div>
      )}

      {planError && (
        <div className="alert" role="alert">
          {planError}
        </div>
      )}

      {round && round.trades.length === 0 && (
        <div className="mini-empty">
          Nobody here can help anybody — everyone&rsquo;s holding the same
          Sprites. Add another player.
        </div>
      )}

      {round && round.trades.length > 0 && (
        <>
          <RoundCards round={round} />

          <div className="share-actions">
            <button className="btn-sync" disabled={busy} onClick={shareImage}>
              {busy ? "Rendering…" : "🖼 Share round image"}
            </button>
            <button className="btn-step" onClick={() => setSeed(seed + 1)}>
              🎲 Re-roll the round
            </button>
            <button
              className="btn-step"
              onClick={() => copy(roundSummaryText(round), "Round copied — paste it into the chat.")}
            >
              📋 Copy as text
            </button>
            <button
              className="btn-step"
              onClick={() =>
                copy(window.location.href, "Link copied — it opens this exact round.")
              }
            >
              🔗 Copy link to this round
            </button>
          </div>
        </>
      )}

      <div className="pub-cta">
        <div className="section-label">Everyone in one place?</div>
        <p>
          Start a trade room instead: pick the player count, share one link,
          and each player drops in their own collection. Trades appear once two
          are in and re-plan as the rest arrive.
        </p>
        <a className="btn-step" href="/room">
          Start a trade room
        </a>
      </div>

      <div className="pub-cta">
        <div className="section-label">Need a code?</div>
        <p>
          Everyone gets theirs from the tracker: sign in with Epic, open{" "}
          <b>Share with friends</b>, tap <b>Copy my collection code</b>, and
          paste it here.
        </p>
        <a className="btn-step" href="/">
          Get my collection code
        </a>
      </div>

      <p className="fineprint">
        This page runs entirely in your browser — the codes never leave it and
        nothing is stored. Fan-made tool, not affiliated with Epic Games.
        Sprite images via fortnite-api.com.
      </p>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
