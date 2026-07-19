"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SPRITES,
  SLUG_LOOKUP,
  ALL_KEYS,
  TOTAL_VARIANTS,
  spriteVariants,
  spriteImage,
} from "../lib/catalog.js";
import { buildCollection, OWNED, PENDING } from "../lib/collection.js";
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
  <svg className="crown" viewBox="0 0 24 17" role="img" aria-label="Mastered — all variants owned">
    <path d="M2 14 L1 3.5 L7.2 7.8 L12 1 L16.8 7.8 L23 3.5 L22 14 Z" />
    <rect x="3" y="15" width="18" height="2" rx="1" />
  </svg>
);

/* ---------------- Login screen ---------------- */

function LoginScreen({ onSignedIn, toast }) {
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const hasCode = /[0-9a-f]{32}/i.test(paste);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/auth/login", {
        body: JSON.stringify({ code: paste }),
      });
      toast(`Signed in as ${data.displayName}`);
      onSignedIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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

      <ol className="steps">
        <li className="step">
          <div className="step-n">1</div>
          <div className="step-body">
            <h2>Sign in at Epic</h2>
            <p>
              Use whatever your Epic account is linked to — PlayStation, Xbox,
              Nintendo, PC, it all works.
            </p>
            <a
              className="btn-step"
              href={LOGIN_URL}
              target="_blank"
              rel="noreferrer"
            >
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
            <a
              className="btn-step"
              href={CODE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Get my code ↗
            </a>
          </div>
        </li>
        <li className="step">
          <div className="step-n">3</div>
          <div className="step-body">
            <h2>Paste it here</h2>
            <p>Paste the code — or the whole page, we'll find it.</p>
            <input
              ref={inputRef}
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
            {process.env.NEXT_PUBLIC_MOCK === "1" && (
              <div className="field-hint">
                Mock mode is on — use test code{" "}
                <b>deadbeefdeadbeefdeadbeefdeadbeef</b> (steps 1–2 not needed).
              </div>
            )}
            {paste && !hasCode && (
              <div className="field-hint">
                No 32-character code found yet — make sure you copied from step
                2.
              </div>
            )}
          </div>
        </li>
      </ol>

      {error && <div className="alert" role="alert">{error}</div>}

      <button
        className="btn-sync"
        onClick={submit}
        disabled={!hasCode || busy}
      >
        {busy ? "Signing in…" : "Sign in & sync"}
      </button>

      <p className="fineprint">
        Your code is exchanged once, server-side, for a sign-in that's stored
        encrypted in your own browser — nothing is kept on a server, and no one
        else can see your account. Sign out any time to revoke it. Fan-made
        tool, not affiliated with Epic Games. Sprite images via fortnite-api.com.
      </p>
    </div>
  );
}

/* ---------------- Share panel ---------------- */

function SharePanel({ collection, displayName, ownedTotal, toast }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // "missing" | "owned" | null
  const [friendCode, setFriendCode] = useState("");
  const [friend, setFriend] = useState(null); // { name, owned: Set }
  const [compareError, setCompareError] = useState(null);

  const mine = useMemo(() => ownedKeySet(collection), [collection]);

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
    const code = encodeCode(collection, displayName);
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

function SpriteRow({ sprite: s, tiles, stats, statusOf }) {
  const [ref, focus] = useCenterFocus();
  const complete = stats.owned === stats.total;
  return (
    <section
      ref={ref}
      className={`srow ${stats.owned > 0 ? "started" : "untouched"} ${
        complete ? "mastered" : ""
      } ${focus ? "infocus" : ""}`}
      style={{ "--accent": `var(--${s.element})` }}
    >
      <img
        className="srow-hero"
        src={spriteImage(s)}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={132}
        height={132}
      />
      <div className="srow-head">
        <h3>
          {s.name}
          {complete && <Crown />}
        </h3>
        <span className={`srow-count ${complete ? "done" : ""}`}>
          {stats.owned}/{stats.total}
        </span>
      </div>
      <div className="vstrip">
        {tiles.map((v) => {
          const state = statusOf(s.slug, v);
          return (
            <div
              key={v}
              role="img"
              className={`vtile ${state} vv-${v.toLowerCase()}`}
              title={v === "Normal" ? "Base" : v}
              aria-label={`${s.name} ${v}: ${
                state === OWNED
                  ? "owned"
                  : state === PENDING
                  ? "quest in progress"
                  : "not owned"
              }`}
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
                    🔒
                  </span>
                )}
                {state === PENDING && (
                  <span className="vpending" aria-hidden="true" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Ledger ---------------- */

export default function Home() {
  const [auth, setAuth] = useState({ state: "loading" }); // loading | out | in
  const [collection, setCollection] = useState({ variants: {}, unmapped: [] });
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("all"); // all | owned | missing
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const bootSynced = useRef(false);

  const toast = useCallback((msg, isError = false) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ msg, isError });
    toastTimer.current = setTimeout(() => setToastMsg(null), isError ? 6000 : 3500);
  }, []);

  const hydrateFromCache = useCallback((accountId) => {
    // Always overwrite state — resetting on a cache miss guarantees one
    // account's data can never bleed into another after an account switch.
    const cached = loadStore(accountId);
    setCollection(cached?.collection || { variants: {}, unmapped: [] });
    setLastSync(cached?.lastSync || null);
    return cached;
  }, []);

  const sync = useCallback(
    async (accountId, { silent = false } = {}) => {
      setSyncing(true);
      try {
        const data = await api("/api/sync");
        const next = buildCollection(data.items);
        setCollection(next);
        setLastSync(data.syncedAt);
        if (data.empty) {
          toast("Synced, but Epic returned no Sprite data yet.", true);
        } else if (!silent) {
          const owned = ownedKeySet(next).size;
          toast(`Synced — ${owned} of ${TOTAL_VARIANTS} Sprites owned`);
        }
      } catch (err) {
        if (err.status === 401) {
          // Full sign-out reset — leaving the old collection in state would
          // let a different account's next sign-in inherit (and persist) it.
          setAuth({ state: "out" });
          setCollection({ variants: {}, unmapped: [] });
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
    saveStore(auth.accountId, { collection, lastSync });
  }, [collection, lastSync, auth]);

  const statusOf = useCallback(
    (slug, variant) => {
      const s = collection.variants[slug]?.[variant];
      return s === OWNED ? OWNED : s === PENDING ? PENDING : "missing";
    },
    [collection]
  );

  async function signOut() {
    try {
      await api("/api/auth/logout");
    } catch {}
    setAuth({ state: "out" });
    setCollection({ variants: {}, unmapped: [] });
    setLastSync(null);
    bootSynced.current = false;
    toast("Signed out — your Epic access was revoked.");
  }

  const spriteStats = useMemo(() => {
    const stats = {};
    for (const s of SPRITES) {
      const vs = spriteVariants(s);
      const owned = vs.filter((v) => statusOf(s.slug, v) === OWNED).length;
      stats[s.slug] = { owned, total: vs.length };
    }
    return stats;
  }, [statusOf]);

  const ownedTotal = useMemo(
    () => Object.values(spriteStats).reduce((n, s) => n + s.owned, 0),
    [spriteStats]
  );

  // Tile-level filtering: "Owned" shows only owned tiles, "Missing" only
  // tiles you don't own yet (incl. in-progress). Rows with no matching
  // tiles disappear.
  const visible = useMemo(
    () =>
      SPRITES.map((s) => {
        const tiles = spriteVariants(s).filter((v) => {
          const st = statusOf(s.slug, v);
          if (filter === "owned") return st === OWNED;
          if (filter === "missing") return st !== OWNED;
          return true;
        });
        return { sprite: s, tiles };
      }).filter((row) => row.tiles.length > 0),
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
              {ownedTotal}
              <small> / {TOTAL_VARIANTS} collected</small>
            </div>
            <div
              className="dustbar"
              aria-label={`${ownedTotal} of ${TOTAL_VARIANTS} sprite variants collected`}
            >
              {SPRITES.map((s) => {
                const st = spriteStats[s.slug];
                const cls =
                  st.owned === st.total ? "lit" : st.owned > 0 ? "part" : "";
                return <span key={s.slug} className={cls} />;
              })}
            </div>
            <div className="chips">
              {[
                ["all", "All"],
                ["owned", "Owned"],
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
              {filter === "missing" && ownedTotal === TOTAL_VARIANTS
                ? "Full collection. Go touch grass, Guardian."
                : filter === "owned"
                ? "Nothing owned yet — hit Refresh from Epic below."
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
                  statusOf={statusOf}
                />
              ))}
            </div>
          )}

          {collection.unmapped.length > 0 && (
            <>
              <div className="section-label">New from Epic — not in catalog yet</div>
              {collection.unmapped.map((u, i) => (
                <div className="raw" key={`${u.templateId}-${i}`}>
                  <b>{u.templateId}</b>
                  <div>
                    {u.state ? `${u.state} · ` : ""}
                    {u.via}
                  </div>
                </div>
              ))}
            </>
          )}

          <SharePanel
            collection={collection}
            displayName={auth.displayName}
            ownedTotal={ownedTotal}
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
          </div>
        </>
      )}
    </main>
  );
}
