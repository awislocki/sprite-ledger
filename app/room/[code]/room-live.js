"use client";

// The live trade room. Everyone opens the same link, drops in their
// collection, and the round re-plans every time somebody joins.
//
// Two things keep the room honest:
//  - The round is planned CLIENT-side from the codes the room hands out, and
//    always at seed 0. The planner is deterministic and every player receives
//    the same roster in the same order, so everyone is looking at the same
//    proposal. That's also why there's no "re-roll" here — one player
//    re-rolling would show them a round nobody else could see.
//  - The room's own clock is authoritative. The countdown below is a
//    convenience; when the room is gone the server says so and the page stops
//    polling.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeCode } from "../../../lib/share.js";
import { planTradeRound } from "../../../lib/trade-round.js";
import { readPngText, FMDS_CODE_KEY } from "../../../lib/png-text.js";
import { renderTradeRoundImage } from "../../../lib/trade-image.js";
import { shareOrDownload } from "../../../lib/share-image.js";
import RoundCards from "../../round-cards.js";
import { hostTokenFor, rememberMe, meIn, forgetMe } from "../room-session.js";

const POLL_MS = 4000;

function countdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function RoomLive({ code }) {
  const [room, setRoom] = useState(null);
  const [closed, setClosed] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [me, setMe] = useState(null);
  const [host, setHost] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const stopped = useRef(false);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    setHost(hostTokenFor(code));
    setMe(meIn(code));
  }, [code]);

  // Poll for the room. A 404 means it closed (host ended it, or the 20
  // minutes ran out) — stop asking rather than hammering a dead room.
  useEffect(() => {
    stopped.current = false;
    let alive = true;
    async function tick() {
      if (stopped.current) return;
      try {
        const res = await fetch(`/api/room/${code}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) {
          stopped.current = true;
          setClosed(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't reach the room.");
        setRoom(data.room);
        setLoadError(null);
      } catch (err) {
        // A blip shouldn't wipe a round off the screen; keep what we have.
        if (alive && !room) setLoadError(err.message);
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // `room` is deliberately not a dependency — it would restart the poll on
    // every update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Tick the countdown only while there's a clock to show.
  useEffect(() => {
    if (!room?.expiresAt || closed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [room?.expiresAt, closed]);

  // Everyone in the room plans from the same roster at seed 0, so everyone
  // sees the same round.
  const round = useMemo(() => {
    if (!room || room.players.length < 2) return null;
    try {
      return planTradeRound(
        room.players.map((p) => ({ name: p.name, owned: decodeCode(p.code).owned })),
        { seed: 0 }
      );
    } catch {
      return null;
    }
  }, [room]);

  async function join(collectionCode) {
    setBusy(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/room/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't join the room.");
      setRoom(data.room);
      const mine = data.room.players.find((p) => p.code === collectionCode);
      if (mine) {
        setMe(mine.name);
        rememberMe(code, mine.name);
      }
      setPaste("");
    } catch (err) {
      setJoinError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // The image the tracker made carries the exact collection code in its PNG
  // metadata, so an upload is a lossless read — no OCR, nothing guessed.
  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after a fix
    if (!file) return;
    setJoinError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const found = readPngText(bytes, FMDS_CODE_KEY);
      if (!found)
        throw new Error(
          "That image doesn't carry a collection code. Chat apps strip it when they re-save a picture — upload the file the tracker downloaded, or paste your code below."
        );
      await join(found);
    } catch (err) {
      setJoinError(err.message);
    }
  }

  async function leave() {
    if (!me) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/room/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: me }),
      });
      const data = await res.json();
      if (res.ok) setRoom(data.room);
      forgetMe(code);
      setMe(null);
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/room/${code}`, {
        method: "DELETE",
        headers: { "x-room-host": host || "" },
      });
      if (res.ok) {
        stopped.current = true;
        setClosed(true);
        say("Room closed — the round below is yours to keep.");
      } else {
        const data = await res.json().catch(() => ({}));
        say(data.error || "Couldn't close the room.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "FMDS trade room",
          text: `Join the trade round — room ${code}:`,
          url,
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say("Room link copied — send it to everyone trading.");
    } catch {
      window.prompt("Copy the room link:", url);
    }
  }

  async function shareImage() {
    setRendering(true);
    try {
      const blob = await renderTradeRoundImage({ round, label: `Room ${code}` });
      const result = await shareOrDownload(
        blob,
        "fmds-trade-round.png",
        "FMDS trade round"
      );
      if (result === "downloaded") say("Round image saved to your downloads.");
    } catch (err) {
      say(`Couldn't make the image: ${err.message}`);
    } finally {
      setRendering(false);
    }
  }

  if (loadError && !room) {
    return (
      <main className="app">
        <div className="pub-head">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
        </div>
        <div className="alert" role="alert">
          {loadError}
        </div>
        <div className="syncbar">
          <a className="btn-sync" href="/room">
            Start a new room
          </a>
        </div>
      </main>
    );
  }

  // A closed room with nothing rendered means the visitor arrived too late.
  if (closed && !round) {
    return (
      <main className="app">
        <div className="pub-head">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
        </div>
        <h1 className="pub-title">Room closed</h1>
        <p className="tr-blurb">
          Room {code} has finished — rooms close 20 minutes after the last
          player joins, or when whoever started it marks it complete.
        </p>
        <div className="syncbar">
          <a className="btn-sync" href="/room">
            Start a new room
          </a>
        </div>
      </main>
    );
  }

  const joined = room?.players.length ?? 0;
  const size = room?.size ?? 0;
  const waiting = Math.max(0, size - joined);
  const left = room?.expiresAt ? room.expiresAt - now : null;

  return (
    <main className="app">
      <header className="hud">
        <div className="acct">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
          <span className="pub-badge">room {code}</span>
        </div>
        <h1 className="pub-title">Trade room</h1>
        {room && (
          <div className="hud-countrow">
            <div className="hud-count">
              {joined}
              <small> / {size} joined</small>
            </div>
            {closed ? (
              <span className="room-clock done">closed</span>
            ) : left !== null ? (
              <span className="room-clock">closes in {countdown(left)}</span>
            ) : (
              <span className="room-clock waiting">
                waiting for {waiting} more
              </span>
            )}
          </div>
        )}
      </header>

      {room && (
        <div className="tr-roster">
          {room.players.map((p) => (
            <span
              className={`tr-player ${p.name === me ? "you" : ""}`}
              key={p.name}
            >
              {p.name}
              {p.name === me && !closed && (
                <button aria-label="Leave the room" onClick={leave}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {Array.from({ length: waiting }).map((_, i) => (
            <span className="tr-player empty" key={`empty-${i}`}>
              waiting…
            </span>
          ))}
        </div>
      )}

      {!closed && !me && (
        <div className="room-join">
          <div className="section-label">Drop in your collection</div>
          <label className="btn-sync room-upload">
            🖼 Upload my collection image
            <input type="file" accept="image/png,image/*" onChange={onFile} />
          </label>
          <p className="field-hint">
            The missing-list or owned-list image from the tracker — it carries
            your collection inside the file.
          </p>
          <div className="share-compare-row">
            <input
              id="room-code-input"
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setJoinError(null);
              }}
              placeholder="…or paste FMDS1.YourName.xxxx"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="btn-step"
              disabled={!paste.trim() || busy}
              onClick={() => join(paste.trim())}
            >
              Join
            </button>
          </div>
          {joinError && (
            <div className="alert" role="alert">
              {joinError}
            </div>
          )}
        </div>
      )}

      {closed && (
        <div className="mini-empty">
          This room has closed. The round below is the final one — save the
          image if you still need it.
        </div>
      )}

      {!closed && joined < 2 && (
        <div className="mini-empty">
          {joined === 0
            ? "Nobody's dropped a collection in yet. Share the link to get started."
            : "One player in. Trades appear as soon as a second one joins."}
        </div>
      )}

      {round && (
        <>
          <div className="section-label">
            {closed || joined >= size
              ? "The round"
              : `Round so far — re-plans as the last ${waiting} join`}
          </div>
          <RoundCards round={round} />
        </>
      )}

      <div className="share-actions">
        {round && (
          <button className="btn-sync" disabled={rendering} onClick={shareImage}>
            {rendering ? "Rendering…" : "🖼 Share round image"}
          </button>
        )}
        {!closed && (
          <button className="btn-step" onClick={shareLink}>
            🔗 Share the room link
          </button>
        )}
        {!closed && host && (
          <button className="btn-step" disabled={busy} onClick={markComplete}>
            ✅ Mark this round complete
          </button>
        )}
      </div>

      {!me && !closed && (
        <div className="pub-cta">
          <div className="section-label">Need your collection image?</div>
          <p>
            Sign in with Epic on the tracker, open <b>Share with friends</b>,
            and tap <b>Missing-list image</b> — then upload that file here.
          </p>
          <a className="btn-step" href="/">
            Get my collection image
          </a>
        </div>
      )}

      <p className="fineprint">
        This room holds only display names and collection codes, and deletes
        itself 20 minutes after the last player joins. Fan-made tool, not
        affiliated with Epic Games. Sprite images via fortnite-api.com.
      </p>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
