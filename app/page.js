"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SPRITES,
  TOTAL_VARIANTS,
  spriteVariants,
  spriteImage,
} from "../lib/catalog.js";
import {
  buildCollection,
  OWNED,
  PENDING,
} from "../lib/collection.js";

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

/* ---------------- Ledger ---------------- */

export default function Home() {
  const [auth, setAuth] = useState({ state: "loading" }); // loading | out | in
  const [collection, setCollection] = useState({ variants: {}, unmapped: [] });
  // Manual fallback: tap a tile to override the synced state.
  // { "slug:Variant": true(owned) | false(not owned) }
  const [manual, setManual] = useState({});
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
    const cached = loadStore(accountId);
    if (cached) {
      setCollection(cached.collection || { variants: {}, unmapped: [] });
      setManual(cached.manual || {});
      setLastSync(cached.lastSync || null);
    }
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
          toast(
            "Synced, but Epic returned no Sprite data yet — you can still track by tapping tiles.",
            true
          );
        } else if (!silent) {
          const owned = Object.values(next.variants)
            .flatMap((vs) => Object.values(vs))
            .filter((s) => s === OWNED).length;
          toast(`Synced — ${owned} of ${TOTAL_VARIANTS} Sprites owned`);
        }
      } catch (err) {
        if (err.status === 401) {
          setAuth({ state: "out" });
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

  // Persist collection + manual edits per account.
  useEffect(() => {
    if (auth.state !== "in") return;
    saveStore(auth.accountId, { collection, manual, lastSync });
  }, [collection, manual, lastSync, auth]);

  // Effective state of one variant tile, manual override included.
  const statusOf = useCallback(
    (slug, variant) => {
      const key = `${slug}:${variant}`;
      if (key in manual) return manual[key] ? OWNED : "missing";
      const s = collection.variants[slug]?.[variant];
      return s === OWNED ? OWNED : s === PENDING ? PENDING : "missing";
    },
    [collection, manual]
  );

  function tapTile(slug, variant) {
    const key = `${slug}:${variant}`;
    const synced = collection.variants[slug]?.[variant] === OWNED;
    setManual((prev) => {
      const next = { ...prev };
      const cur = key in next ? next[key] : synced;
      const flipped = !cur;
      // Drop the override when it matches what sync says anyway.
      if (flipped === synced) delete next[key];
      else next[key] = flipped;
      return next;
    });
  }

  async function signOut() {
    try {
      await api("/api/auth/logout");
    } catch {}
    setAuth({ state: "out" });
    setCollection({ variants: {}, unmapped: [] });
    setManual({});
    setLastSync(null);
    bootSynced.current = false;
    toast("Signed out — your Epic access was revoked.");
  }

  // Per-sprite owned counts (manual included) drive everything below.
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

  const visible = useMemo(
    () =>
      SPRITES.filter((s) => {
        const st = spriteStats[s.slug];
        if (filter === "owned") return st.owned > 0;
        if (filter === "missing") return st.owned < st.total;
        return true;
      }),
    [filter, spriteStats]
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
                : "Nothing matches this filter."}
            </div>
          ) : (
            <div className="rows">
              {visible.map((s) => {
                const st = spriteStats[s.slug];
                const complete = st.owned === st.total;
                return (
                  <section
                    key={s.slug}
                    className={`srow ${st.owned > 0 ? "started" : "untouched"}`}
                    style={{ "--accent": `var(--${s.element})` }}
                  >
                    <div className="srow-head">
                      <img
                        className="srow-icon"
                        src={spriteImage(s)}
                        alt=""
                        loading="lazy"
                        width={44}
                        height={44}
                      />
                      <h3>{s.name}</h3>
                      <span className={`srow-count ${complete ? "done" : ""}`}>
                        {complete ? "✓ " : ""}
                        {st.owned}/{st.total}
                      </span>
                    </div>
                    <div className="vstrip">
                      {spriteVariants(s).map((v) => {
                        const state = statusOf(s.slug, v);
                        return (
                          <button
                            key={v}
                            className={`vtile ${state}`}
                            onClick={() => tapTile(s.slug, v)}
                            aria-pressed={state === OWNED}
                            aria-label={`${s.name} ${v}: ${
                              state === OWNED
                                ? "owned"
                                : state === PENDING
                                ? "quest in progress"
                                : "not owned"
                            }. Tap to toggle manually.`}
                          >
                            <span className="vtile-img">
                              <img
                                src={spriteImage(s, v)}
                                alt=""
                                loading="lazy"
                                width={58}
                                height={58}
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
                            <span className={`vlabel v-${v.toLowerCase()}`}>
                              {v === "Normal" ? "Base" : v}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {collection.unmapped.length > 0 && (
            <>
              <div className="section-label">New from Epic — not in catalog yet</div>
              {collection.unmapped.map((u, i) => (
                <div className="raw" key={`${u.templateId}-${i}`}>
                  <b>{u.templateId}</b>
                  <div>
                    {u.state ? `quest ${u.state} · ` : ""}
                    {u.via}
                  </div>
                </div>
              ))}
            </>
          )}

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
