"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SPRITES,
  ALL_SPRITES,
  SLUG_LOOKUP,
  ALL_KEYS,
  MANUAL_KEYS,
  TOTAL_VARIANTS,
  spriteVariants,
  spriteImage,
} from "../lib/catalog.js";
import {
  buildCollection,
  slimItem,
  expandSlimItems,
  countMastered,
} from "../lib/collection.js";
import { encodeCode, decodeCode, tradeDiff, ownedKeySet } from "../lib/share.js";
import { renderShareImage, shareOrDownload } from "../lib/share-image.js";

// Must match EPIC_CLIENT_ID in lib/epic.js — the auth code Epic issues here is
// redeemed with that client's credentials. fortniteAndroidGameClient (Epic
// disabled the old iOS client in 2026). Override with NEXT_PUBLIC_EPIC_CLIENT_ID.
const EPIC_CLIENT_ID =
  process.env.NEXT_PUBLIC_EPIC_CLIENT_ID || "3f69e56c7649492c8cc29f1af08a8a12";
const LOGIN_URL = "https://www.epicgames.com/id/login";
const CODE_URL = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;

// Auto-sync at most every 12h; the Refresh button always syncs.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const storageKey = (accountId) => `sprite-ledger:v2:${accountId || "local"}`;
// Manual "found" toggles live in their OWN long-term key so a re-sync or a
// parser upgrade never wipes them.
const foundKey = (accountId) => `sprite-ledger:found:${accountId || "local"}`;

// Stable empty collection — module scope so its identity never changes (a
// fresh literal in the component body would churn hook dep arrays).
const EMPTY = Object.freeze({ mastered: {}, found: {}, unknownChains: {}, unmapped: [] });

// Manual override states, in rank order for the tap cycle.
const RANK = { missing: 0, found: 1, mastered: 2 };
const CYCLE = ["missing", "found", "mastered"];

function loadStore(accountId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(accountId))) || null;
  } catch {
    return null;
  }
}
function saveStore(accountId, data) {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(data));
  } catch {}
}
// Manual overrides: { "slug:Variant": "found" | "mastered" }. Migrates the
// old array-of-found-keys format.
function loadManual(accountId) {
  try {
    const raw = JSON.parse(localStorage.getItem(foundKey(accountId)));
    if (Array.isArray(raw)) return Object.fromEntries(raw.map((k) => [k, "found"]));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
function saveManual(accountId, obj) {
  try {
    localStorage.setItem(foundKey(accountId), JSON.stringify(obj));
  } catch {}
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw new Error("You're offline — check your connection and try again.");
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const keyInfo = (key) => {
  const [slug, variant] = key.split(":");
  return { sprite: SLUG_LOOKUP[slug], variant };
};

// True while the element sits in the middle band of the viewport — drives
// the hero image's black&white → colour reveal as rows scroll through.
// A healthy IntersectionObserver always delivers an initial entry; if none
// arrives (or IO is missing), fall back to permanently coloured rather than
// leaving heroes grey forever.
function useCenterFocus() {
  const ref = useRef(null);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setFocus(true);
      return;
    }
    let fired = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        fired = true;
        setFocus(entry.isIntersecting);
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: 0 }
    );
    io.observe(el);
    const fallback = setTimeout(() => {
      if (!fired) {
        io.disconnect();
        setFocus(true);
      }
    }, 1500);
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, []);
  return [ref, focus];
}

const Crown = () => (
  <svg className="crown" viewBox="0 0 24 17" role="img" aria-label="Mastered — level 5">
    <path d="M2 14 L1 3.5 L7.2 7.8 L12 1 L16.8 7.8 L23 3.5 L22 14 Z" />
    <rect x="3" y="15" width="18" height="2" rx="1" />
  </svg>
);

/* ---------------- Login screen ---------------- */

function LoginScreen({ onSignedIn, toast }) {
  const [mode, setMode] = useState("device"); // device | manual

  // Device-code flow
  const [device, setDevice] = useState(null); // { userCode, verificationUriComplete, ... }
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState(null);
  const pollRef = useRef(null);
  const deadlineRef = useRef(0);
  const inFlightRef = useRef(false);
  const pollOnceRef = useRef(null);

  // Manual auth-code flow
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasCode = /[0-9a-f]{32}/i.test(paste);

  const stopPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    pollOnceRef.current = null;
    inFlightRef.current = false;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  // iOS suspends timers in background tabs, so a poll may not fire while the
  // user is confirming in the Epic tab. Poll immediately when they return —
  // this is what made "doing it twice" unnecessary.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && pollOnceRef.current) {
        pollOnceRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  async function startDevice() {
    setDeviceBusy(true);
    setDeviceError(null);
    try {
      const d = await api("/api/auth/device/start");
      setDevice(d);
      deadlineRef.current = Date.now() + (d.expiresIn || 600) * 1000;
      stopPolling();
      const pollOnce = async () => {
        if (Date.now() > deadlineRef.current) {
          stopPolling();
          setDevice(null);
          setDeviceError("That sign-in request expired — tap sign in to retry.");
          return;
        }
        // A slow response must not let the next tick fire a second request.
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const r = await api("/api/auth/device/poll");
          if (r.status === "complete") {
            stopPolling();
            toast(`Signed in as ${r.displayName}`);
            onSignedIn(r);
          }
        } catch (err) {
          stopPolling();
          setDevice(null);
          setDeviceError(err.message);
        } finally {
          inFlightRef.current = false;
        }
      };
      pollOnceRef.current = pollOnce;
      pollRef.current = setInterval(pollOnce, Math.max(2, d.interval || 5) * 1000);
    } catch (err) {
      setDeviceError(err.message);
    } finally {
      setDeviceBusy(false);
    }
  }

  function cancelDevice() {
    stopPolling();
    setDevice(null);
    setDeviceError(null);
  }

  async function submitManual(code = paste) {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/auth/login", {
        body: JSON.stringify({ code }),
      });
      toast(`Signed in as ${data.displayName}`);
      onSignedIn(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // One tap on phones: read the clipboard, extract the code, sign in — no
  // tapping into the field and long-press-pasting.
  async function pasteAndSubmit() {
    setError(null);
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setError(
        "Couldn't read your clipboard — paste into the box below and tap Sign in."
      );
      return;
    }
    if (text) setPaste(text);
    if (/[0-9a-f]{32}/i.test(text)) {
      submitManual(text);
    } else {
      setError(
        "No Epic code on your clipboard yet — copy the whole Epic page (step 2) first, then tap Paste."
      );
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <img
          className="login-logo"
          src="/logo.png"
          alt="FMDS — Fortnite Sprite Tracker"
          width={1131}
          height={439}
        />
        <p>
          Your Fortnite Sprite collection, synced from your Epic account — see
          what you still need before you drop.
        </p>
      </div>

      {mode === "device" ? (
        <div className="device">
          {!device ? (
            <>
              <button
                className="btn-sync"
                onClick={startDevice}
                disabled={deviceBusy}
              >
                {deviceBusy ? "Starting…" : "Sign in with Epic"}
              </button>
              <p className="device-blurb">
                Opens Epic in a new tab — sign in (PlayStation, Xbox, Nintendo,
                or PC all work), confirm the code, and you'll land back here
                signed in. No copy/paste.
              </p>
            </>
          ) : (
            <div className="device-live">
              <a
                className="btn-sync"
                href={device.verificationUriComplete || device.verificationUri}
                target="_blank"
                rel="noreferrer"
              >
                Open Epic to confirm ↗
              </a>
              <div className="device-code" aria-label="Your confirmation code">
                {device.userCode}
              </div>
              <p className="device-blurb">
                On the Epic page, sign in and confirm this code matches. Keep
                this tab open — it'll sign you in automatically.
                <span className="device-wait">Waiting for confirmation…</span>
              </p>
              <p className="device-warn" role="note">
                🛡 Only ever confirm a code you started right here. Never enter
                a code someone sent you — that would sign <b>them</b> into your
                account.
              </p>
              <button className="linklike" onClick={cancelDevice}>
                Cancel
              </button>
            </div>
          )}
          {deviceError && (
            <div className="alert" role="alert">{deviceError}</div>
          )}
          <button
            className="linklike login-switch"
            onClick={() => {
              cancelDevice();
              setMode("manual");
            }}
          >
            Trouble signing in? Enter a code manually
          </button>
        </div>
      ) : (
        <div className="manual">
          <ol className="steps">
            <li className="step">
              <div className="step-n">1</div>
              <div className="step-body">
                <h2>Sign in at Epic</h2>
                <p>
                  Use whatever your Epic account is linked to — PlayStation,
                  Xbox, Nintendo, PC, it all works.
                </p>
                <a className="btn-step" href={LOGIN_URL} target="_blank" rel="noreferrer">
                  Open Epic login ↗
                </a>
              </div>
            </li>
            <li className="step">
              <div className="step-n">2</div>
              <div className="step-body">
                <h2>Get your one-time code</h2>
                <p>
                  This page shows a short blob of text containing your{" "}
                  <b>authorizationCode</b>. Copy any of it.
                </p>
                <a className="btn-step" href={CODE_URL} target="_blank" rel="noreferrer">
                  Get my code ↗
                </a>
              </div>
            </li>
            <li className="step">
              <div className="step-n">3</div>
              <div className="step-body">
                <h2>Come back & tap paste</h2>
                <p>
                  On the Epic page just <b>Select All → Copy</b> (grabbing the
                  whole page is fine — we pick out the code). Then:
                </p>
                <button
                  className="btn-sync paste-btn"
                  onClick={pasteAndSubmit}
                  disabled={busy}
                >
                  {busy ? "Signing in…" : "📋 Paste code & sign in"}
                </button>
                <details className="paste-manual">
                  <summary>or paste it in a box</summary>
                  <input
                    value={paste}
                    onChange={(e) => {
                      setPaste(e.target.value);
                      setError(null);
                    }}
                    placeholder='{"authorizationCode":"a1b2c3…"}'
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                  />
                  <button
                    className="btn-step"
                    onClick={() => submitManual()}
                    disabled={!hasCode || busy}
                  >
                    {busy ? "Signing in…" : "Sign in with pasted code"}
                  </button>
                </details>
                {process.env.NEXT_PUBLIC_MOCK === "1" && (
                  <div className="field-hint">
                    Mock mode is on — use test code{" "}
                    <b>deadbeefdeadbeefdeadbeefdeadbeef</b> (steps 1–2 not needed).
                  </div>
                )}
              </div>
            </li>
          </ol>

          {error && <div className="alert" role="alert">{error}</div>}

          <button className="linklike login-switch" onClick={() => setMode("device")}>
            ← Back to one-tap sign in
          </button>
        </div>
      )}

      <p className="fineprint">
        Your sign-in is stored encrypted in your own browser — nothing is kept
        on a server, and no one else can see your account. Sign out any time to
        revoke it. Fan-made tool, not affiliated with Epic Games. Sprite images
        via fortnite-api.com.
      </p>
    </div>
  );
}

/* ---------------- Share panel ---------------- */

function SharePanel({ collection, manualKeys, displayName, toast }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // "missing" | "owned" | null
  const [friendCode, setFriendCode] = useState("");
  const [friend, setFriend] = useState(null); // { name, owned: Set }
  const [compareError, setCompareError] = useState(null);

  // Everything you have to trade = mastered + found + your manual toggles.
  const mine = useMemo(
    () => ownedKeySet(collection, manualKeys),
    [collection, manualKeys]
  );
  const ownedTotal = mine.size;

  // Warm the browser cache for every variant image as soon as the panel
  // opens — image rendering is then near-instant, which keeps iOS Safari's
  // share-sheet user-activation window from expiring mid-render.
  useEffect(() => {
    if (!open) return;
    for (const k of ALL_KEYS) {
      const { sprite, variant } = keyInfo(k);
      if (!sprite) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = spriteImage(sprite, variant);
    }
  }, [open]);

  async function makeImage(mode) {
    setBusy(mode);
    try {
      const keys =
        mode === "owned"
          ? [...mine]
          : ALL_KEYS.filter((k) => !mine.has(k));
      if (keys.length === 0) {
        toast(
          mode === "owned"
            ? "Nothing owned yet — sync first."
            : "Nothing missing. Flex away."
        );
        return;
      }
      const blob = await renderShareImage({
        title: mode === "owned" ? "Owned Sprites" : "Missing Sprites",
        subtitle: `${displayName} · ${ownedTotal}/${TOTAL_VARIANTS} collected`,
        keys,
      });
      const result = await shareOrDownload(
        blob,
        `fmds-${mode}-sprites.png`,
        `${displayName}'s ${mode} Sprites`
      );
      if (result === "downloaded") toast("Image saved to your downloads.");
    } catch (err) {
      toast(`Couldn't make the image: ${err.message}`, true);
    } finally {
      setBusy(null);
    }
  }

  async function copyCode() {
    // `mine` already folds in the manual toggles.
    const code = encodeCode(mine, displayName);
    try {
      await navigator.clipboard.writeText(code);
      toast("Collection code copied — send it to a friend.");
    } catch {
      // Clipboard can be blocked; show it for manual copy.
      window.prompt("Copy your collection code:", code);
    }
  }

  function runCompare() {
    setCompareError(null);
    setFriend(null);
    try {
      setFriend(decodeCode(friendCode));
    } catch (err) {
      setCompareError(err.message);
    }
  }

  // Derived from current state so the diff never goes stale after a re-sync.
  const compare = useMemo(
    () => (friend ? { name: friend.name, ...tradeDiff(mine, friend.owned) } : null),
    [friend, mine]
  );

  const renderKeys = (keys) =>
    keys.length === 0 ? (
      <div className="mini-empty">Nothing — all covered.</div>
    ) : (
      <div className="mini-tiles">
        {keys.map((k) => {
          const { sprite, variant } = keyInfo(k);
          if (!sprite) return null;
          return (
            <span className="mini-tile" key={k} title={`${sprite.name} — ${variant}`}>
              <img src={spriteImage(sprite, variant)} alt="" width={34} height={34} loading="lazy" />
              <em>
                {sprite.name}
                <br />
                {variant === "Normal" ? "Base" : variant}
              </em>
            </span>
          );
        })}
      </div>
    );

  return (
    <div className="share">
      <button className="btn-step share-toggle" onClick={() => setOpen(!open)}>
        {open ? "Close sharing" : "Share with friends"}
      </button>

      {open && (
        <div className="share-body">
          <div className="share-actions">
            <button className="btn-step" disabled={!!busy} onClick={() => makeImage("missing")}>
              {busy === "missing" ? "Rendering…" : "🖼 Missing-list image"}
            </button>
            <button className="btn-step" disabled={!!busy} onClick={() => makeImage("owned")}>
              {busy === "owned" ? "Rendering…" : "🖼 Owned-list image"}
            </button>
            <button className="btn-step" onClick={copyCode}>
              📋 Copy my collection code
            </button>
          </div>

          <div className="share-compare">
            <label htmlFor="friend-code">
              Paste a friend's collection code to compare:
            </label>
            <div className="share-compare-row">
              <input
                id="friend-code"
                value={friendCode}
                onChange={(e) => {
                  setFriendCode(e.target.value);
                  setCompareError(null);
                }}
                placeholder="FMDS1.TheirName.xxxx"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="btn-step"
                disabled={!friendCode.trim()}
                onClick={runCompare}
              >
                Compare
              </button>
            </div>
            {compareError && (
              <div className="alert" role="alert">{compareError}</div>
            )}
            {compare && (
              <div className="compare-result">
                <div className="section-label">
                  You have · {compare.name} needs ({compare.youOffer.length})
                </div>
                {renderKeys(compare.youOffer)}
                <div className="section-label">
                  {compare.name} has · you need ({compare.theyOffer.length})
                </div>
                {renderKeys(compare.theyOffer)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Sprite row ---------------- */

function SpriteRow({ sprite: s, tiles, stats, tileInfo, onToggle }) {
  const [ref, focus] = useCenterFocus();
  const have = stats.mastered + stats.found;
  const allMastered = stats.mastered > 0 && stats.mastered === stats.total;
  return (
    <section
      ref={ref}
      className={`srow ${have > 0 ? "started" : "untouched"} ${
        allMastered ? "mastered" : ""
      } ${focus ? "infocus" : ""}`}
      style={{ "--accent": `var(--${s.element})` }}
    >
      <img
        className={`srow-hero ${s.provisional ? "provisional" : ""}`}
        src={spriteImage(s)}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={196}
        height={196}
      />
      <div className="srow-head">
        <h3>
          {s.name}
          {s.provisional && (
            <span className="prov-badge" title="Not in Epic's sync — track it manually">
              manual
            </span>
          )}
        </h3>
        <span className="srow-count">
          <b className={allMastered ? "done" : ""}>{stats.mastered}</b>
          <small> mastered</small>
          {stats.found > 0 && <em> · +{stats.found} found</em>}
          <small> / {stats.total}</small>
        </span>
      </div>
      <div className="vstrip">
        {tiles.map((v) => {
          const { state, source, toggleable } = tileInfo(s.slug, v);
          const vname = v === "Normal" ? "Base" : v;
          const nextHint =
            state === "missing"
              ? "tap: mark found"
              : state === "found"
              ? "tap: mark mastered"
              : "tap: clear";
          const label = `${vname} · ${
            state === "mastered"
              ? source === "sync"
                ? "mastered"
                : `mastered (manual) — ${nextHint}`
              : state === "found"
              ? source === "sync"
                ? "found (from Epic)"
                : `found — ${nextHint}`
              : `not found — ${nextHint}`
          }`;
          const Tag = toggleable ? "button" : "div";
          return (
            <Tag
              key={v}
              role={toggleable ? undefined : "img"}
              className={`vtile ${state} vv-${v.toLowerCase()} ${
                state === "mastered" ? "vmastered" : ""
              } ${toggleable ? "tappable" : ""} ${s.provisional ? "prov" : ""}`}
              onClick={toggleable ? () => onToggle(s.slug, v) : undefined}
              title={label}
              aria-label={`${s.name} ${label}`}
            >
              <span className="vtile-img">
                <img
                  src={spriteImage(s, v)}
                  alt=""
                  loading="lazy"
                  width={54}
                  height={54}
                />
                {state === "missing" && (
                  <span className="vlock" aria-hidden="true">
                    +
                  </span>
                )}
                {state === "found" && (
                  <span className="vcaught" aria-hidden="true">
                    ✓
                  </span>
                )}
                {state === "mastered" && (
                  <span className="vcrown" aria-hidden="true">
                    <Crown />
                  </span>
                )}
              </span>
            </Tag>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Ledger ---------------- */

export default function Home() {
  const [auth, setAuth] = useState({ state: "loading" }); // loading | out | in
  const [collection, setCollection] = useState(EMPTY);
  // Manual overrides: { "slug:Variant": "found" | "mastered" }.
  const [manual, setManual] = useState({});
  const [report, setReport] = useState(null); // slim raw sync, for debugging
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("all"); // all | mastered | found | missing
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const bootSynced = useRef(false);

  // Prune manual overrides the sync now covers (sync at or above the manual
  // rank wins) and any key no longer in the catalog (would be a phantom).
  const reconcileManual = useCallback((col, obj) => {
    let changed = false;
    const next = { ...obj };
    for (const [key, val] of Object.entries(obj)) {
      const [slug, variant] = key.split(":");
      const syncRank = col.mastered?.[slug]?.[variant]
        ? RANK.mastered
        : col.found?.[slug]?.[variant]
        ? RANK.found
        : RANK.missing;
      if (!MANUAL_KEYS.has(key) || syncRank >= RANK[val]) {
        delete next[key];
        changed = true;
      }
    }
    return changed ? next : obj;
  }, []);

  const toast = useCallback((msg, isError = false) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ msg, isError });
    toastTimer.current = setTimeout(() => setToastMsg(null), isError ? 6000 : 3500);
  }, []);

  const hydrateFromCache = useCallback((accountId) => {
    // Always overwrite state — resetting on a cache miss guarantees one
    // account's data can never bleed into another after an account switch.
    // When a raw report is cached, RE-PARSE it with the current parser so
    // app updates improve the display without waiting for an Epic refresh.
    const cached = loadStore(accountId);
    let col = cached?.collection || EMPTY;
    if (cached?.report?.items) {
      try {
        col = buildCollection(expandSlimItems(cached.report.items));
      } catch {
        // fall back to the stored parse
      }
    }
    const m = reconcileManual(col, loadManual(accountId));
    setCollection(col);
    setManual(m);
    saveManual(accountId, m);
    setReport(cached?.report || null);
    setLastSync(cached?.lastSync || null);
    return cached;
  }, [reconcileManual]);

  const sync = useCallback(
    async (accountId, { silent = false } = {}) => {
      setSyncing(true);
      try {
        const data = await api("/api/sync");
        const next = buildCollection(data.items);
        setCollection(next);
        setManual((prev) => {
          const rec = reconcileManual(next, prev);
          saveManual(accountId, rec);
          return rec;
        });
        // Slim raw snapshot: powers "Copy sync report" and load-time
        // re-parsing after app updates.
        setReport({
          syncedAt: data.syncedAt,
          profileErrors: data.profileErrors || [],
          attributes: data.attributes || [],
          debug: data.debug || null,
          items: (data.items || []).map(slimItem),
        });
        setLastSync(data.syncedAt);
        if (data.empty) {
          toast("Synced, but Epic returned no Sprite data yet.", true);
        } else if (!silent) {
          const m = countMastered(next);
          toast(`Synced — ${m} of ${TOTAL_VARIANTS} Sprites mastered`);
        }
      } catch (err) {
        if (err.status === 401) {
          // Full sign-out reset — leaving the old collection in state would
          // let a different account's next sign-in inherit (and persist) it.
          setAuth({ state: "out" });
          setCollection(EMPTY);
          setLastSync(null);
          bootSynced.current = false;
          toast(err.message === "signed_out" ? "Please sign in." : err.message, true);
        } else {
          toast(err.message, true);
        }
      } finally {
        setSyncing(false);
      }
    },
    [toast]
  );

  // Boot: who am I? Cache-first render; hit Epic only if the cache is stale.
  useEffect(() => {
    (async () => {
      try {
        const me = await api("/api/auth/me", { method: "GET" });
        setAuth({ state: "in", ...me });
        const cached = hydrateFromCache(me.accountId);
        if (!bootSynced.current) {
          bootSynced.current = true;
          const age = cached?.lastSync
            ? Date.now() - new Date(cached.lastSync).getTime()
            : Infinity;
          if (age > CACHE_TTL_MS) sync(me.accountId, { silent: true });
        }
      } catch {
        setAuth({ state: "out" });
      }
    })();
  }, [hydrateFromCache, sync]);

  // Persist per account.
  useEffect(() => {
    if (auth.state !== "in") return;
    saveStore(auth.accountId, { collection, report, lastSync });
  }, [collection, report, lastSync, auth]);

  async function copyReport() {
    if (!report) {
      toast("No sync yet — hit Refresh from Epic first.", true);
      return;
    }
    const text = JSON.stringify(report, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      toast("Sync report copied — paste it to whoever's debugging.");
    } catch {
      window.prompt("Copy your sync report:", text);
    }
  }

  // Effective per-variant state = the higher of what Epic synced and what the
  // user manually set. { state, sync, source, toggleable }.
  const tileInfo = useCallback(
    (slug, variant) => {
      const sync = collection.mastered?.[slug]?.[variant]
        ? "mastered"
        : collection.found?.[slug]?.[variant]
        ? "found"
        : "missing";
      const man = manual[`${slug}:${variant}`]; // "found"|"mastered"|undefined
      const state = man && RANK[man] > RANK[sync] ? man : sync;
      const source = state === sync && sync !== "missing" ? "sync" : man ? "manual" : "none";
      // Epic-mastered is locked; everything else can be cycled manually.
      return { state, sync, source, toggleable: sync !== "mastered" };
    },
    [collection, manual]
  );
  const statusOf = useCallback((slug, variant) => tileInfo(slug, variant).state, [tileInfo]);

  // Tap cycles a tile up: missing → found → mastered → back to whatever the
  // sync floor is (you can never drop below what Epic reports).
  const cycleTile = useCallback(
    (slug, variant) => {
      const { state, sync, toggleable } = tileInfo(slug, variant);
      if (!toggleable) return;
      let nextRank = (RANK[state] + 1) % 3;
      if (nextRank < RANK[sync]) nextRank = RANK[sync];
      const next = CYCLE[nextRank];
      const key = `${slug}:${variant}`;
      setManual((prev) => {
        const nm = { ...prev };
        if (RANK[next] <= RANK[sync]) delete nm[key]; // back to the sync floor
        else nm[key] = next;
        if (auth.accountId) saveManual(auth.accountId, nm);
        return nm;
      });
    },
    [tileInfo, auth]
  );

  async function signOut() {
    try {
      await api("/api/auth/logout");
    } catch {}
    setAuth({ state: "out" });
    setCollection(EMPTY);
    setManual({});
    setLastSync(null);
    bootSynced.current = false;
    toast("Signed out — your Epic access was revoked.");
  }

  const spriteStats = useMemo(() => {
    const stats = {};
    for (const s of ALL_SPRITES) {
      const vs = spriteVariants(s);
      let mastered = 0;
      let found = 0;
      for (const v of vs) {
        const st = statusOf(s.slug, v);
        if (st === "mastered") mastered++;
        else if (st === "found") found++;
      }
      stats[s.slug] = { mastered, found, total: vs.length };
    }
    return stats;
  }, [statusOf]);

  const masteredTotal = useMemo(
    () => Object.values(spriteStats).reduce((n, s) => n + s.mastered, 0),
    [spriteStats]
  );
  const foundTotal = useMemo(
    () => Object.values(spriteStats).reduce((n, s) => n + s.found, 0),
    [spriteStats]
  );
  const catalogTotal = useMemo(
    () => ALL_SPRITES.reduce((n, s) => n + spriteVariants(s).length, 0),
    []
  );
  // Everything the user manually marked (found or mastered) — folded into the
  // share owned-set. Provisional keys just get ignored by the share encoder.
  const manualKeys = useMemo(() => Object.keys(manual), [manual]);

  // Tile-level filtering: "Mastered" shows only mastered tiles, "Missing"
  // only tiles you don't have. Rows with no matching tiles disappear.
  const visible = useMemo(
    () =>
      ALL_SPRITES.map((s) => {
        const tiles = spriteVariants(s).filter((v) => {
          const st = statusOf(s.slug, v);
          if (filter === "mastered") return st === "mastered";
          if (filter === "found") return st === "found";
          if (filter === "missing") return st === "missing";
          return true;
        });
        return { sprite: s, tiles };
      })
        .filter((row) => row.tiles.length > 0)
        // Alphabetical display order (view only — catalog order is unchanged).
        .sort((a, b) => a.sprite.name.localeCompare(b.sprite.name)),
    [filter, statusOf]
  );

  /* ---------- render ---------- */

  if (auth.state === "loading") {
    return (
      <main className="app">
        <div className="boot" aria-label="Loading">
          <div className="orb-cluster">
            <span style={{ "--accent": "var(--dust)" }} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      {toastMsg && (
        <div className={`toast ${toastMsg.isError ? "err" : ""}`} role="status">
          {toastMsg.msg}
        </div>
      )}

      {auth.state === "out" ? (
        <LoginScreen
          toast={toast}
          onSignedIn={(me) => {
            setAuth({ state: "in", ...me });
            hydrateFromCache(me.accountId);
            sync(me.accountId, { silent: true });
          }}
        />
      ) : (
        <>
          <header className="hud">
            <div className="acct">
              <span className="hud-eyebrow">
                <img src="/mascot.png" alt="" width={22} height={22} />
                FMDS Sprite Tracker
              </span>
              <button className="acct-name" onClick={signOut}>
                {auth.displayName} · Sign out
              </button>
            </div>
            <div className="hud-count">
              {masteredTotal}
              <small> / {catalogTotal} mastered</small>
              {foundTotal > 0 && <em className="hud-found"> · +{foundTotal} found</em>}
            </div>
            <div
              className="dustbar"
              aria-label={`${masteredTotal} of ${catalogTotal} sprite variants mastered`}
            >
              {ALL_SPRITES.map((s) => {
                const st = spriteStats[s.slug];
                const cls =
                  st.mastered === st.total
                    ? "lit"
                    : st.mastered + st.found > 0
                    ? "part"
                    : "";
                return <span key={s.slug} className={cls} />;
              })}
            </div>
            <div className="chips">
              {[
                ["all", "All"],
                ["mastered", "Mastered"],
                ["found", "Found"],
                ["missing", "Missing"],
              ].map(([f, label]) => (
                <button
                  key={f}
                  className={`chip ${filter === f ? "on" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          {visible.length === 0 ? (
            <div className="empty">
              {filter === "missing" && masteredTotal + foundTotal === catalogTotal
                ? "Nothing missing — every Sprite is found or mastered."
                : filter === "mastered"
                ? "Nothing mastered yet — hit Refresh from Epic below."
                : filter === "found"
                ? "Nothing marked found yet — tap a tile to track one."
                : "Nothing matches this filter."}
            </div>
          ) : (
            <div className="rows">
              {visible.map(({ sprite: s, tiles }) => (
                <SpriteRow
                  key={s.slug}
                  sprite={s}
                  tiles={tiles}
                  stats={spriteStats[s.slug]}
                  tileInfo={tileInfo}
                  onToggle={cycleTile}
                />
              ))}
            </div>
          )}

          {(collection.unmapped.length > 0 ||
            Object.keys(collection.unknownChains || {}).length > 0) && (
            <>
              <div className="section-label">New from Epic — not in catalog yet</div>
              {Object.entries(collection.unknownChains || {}).map(
                ([chain, count]) => (
                  <div className="raw" key={`chain-${chain}`}>
                    <b>Unreleased sprite — mastery chain q{chain}</b>
                    <div>
                      {count} variant{count > 1 ? "s" : ""} caught · this sprite
                      (a collab?) isn't in the catalog yet
                    </div>
                  </div>
                )
              )}
              {collection.unmapped.map((u, i) => (
                <div className="raw" key={`${u.templateId}-${i}`}>
                  <b>{u.templateId}</b>
                  <div>
                    {u.note ? `${u.note} · ` : ""}
                    {u.via}
                  </div>
                </div>
              ))}
            </>
          )}

          <SharePanel
            collection={collection}
            manualKeys={manualKeys}
            displayName={auth.displayName}
            toast={toast}
          />

          <div className="syncbar">
            <button
              className="btn-sync"
              onClick={() => sync(auth.accountId)}
              disabled={syncing}
            >
              {syncing ? "Syncing…" : "Refresh from Epic"}
            </button>
          </div>
          <div className="sync-status">
            {lastSync
              ? `Synced ${formatAgo(lastSync)} · auto-syncs every 12h — refresh any time`
              : "Not synced yet"}
            {" · "}
            <button className="linklike" onClick={copyReport}>
              Copy sync report
            </button>
          </div>
        </>
      )}
    </main>
  );
}
