"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATALOG,
  VARIANTS,
  matchCatalogEntry,
  matchVariant,
} from "../lib/catalog";

const EPIC_CLIENT_ID = "3446cd72694c4a4485d81b77adbb2141";
const LOGIN_URL = "https://www.epicgames.com/id/login";
const CODE_URL = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;

const storageKey = (accountId) => `sprite-ledger:${accountId || "local"}`;

function loadCollection(accountId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(accountId))) || null;
  } catch {
    return null;
  }
}
function saveCollection(accountId, data) {
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
        <div className="orb-cluster" aria-hidden="true">
          <span style={{ "--accent": "var(--fire)" }} />
          <span style={{ "--accent": "var(--water)" }} />
          <span style={{ "--accent": "var(--earth)" }} />
        </div>
        <h1>Sprite Ledger</h1>
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
        tool, not affiliated with Epic Games.
      </p>
    </div>
  );
}

/* ---------------- Ledger ---------------- */

export default function Home() {
  const [auth, setAuth] = useState({ state: "loading" }); // loading | out | in
  const [owned, setOwned] = useState({});
  const [unmapped, setUnmapped] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState("needed");
  const [element, setElement] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const syncedOnce = useRef(false);

  const toast = useCallback((msg, isError = false) => {
    clearTimeout(toastTimer.current);
    setToastMsg({ msg, isError });
    toastTimer.current = setTimeout(() => setToastMsg(null), isError ? 6000 : 3500);
  }, []);

  const hydrateFromCache = useCallback((accountId) => {
    const cached = loadCollection(accountId);
    if (cached) {
      setOwned(cached.owned || {});
      setUnmapped(cached.unmapped || []);
      setAttributes(cached.attributes || []);
      setLastSync(cached.lastSync || null);
    }
  }, []);

  const sync = useCallback(
    async (accountId, { silent = false } = {}) => {
      setSyncing(true);
      try {
        const data = await api("/api/sync");
        setOwned((prev) => {
          const next = { ...prev };
          const nextUnmapped = [];
          for (const item of data.items || []) {
            const entry = matchCatalogEntry(item.templateId);
            if (!entry) {
              nextUnmapped.push(item);
              continue;
            }
            const variant = matchVariant(item.templateId);
            const level =
              Number(
                item.attributes?.level ?? item.attributes?.sprite_level ?? 1
              ) || 1;
            const cur = next[entry.id] || { level: 0, variants: [] };
            next[entry.id] = {
              level: Math.max(cur.level, Math.min(level, 5), 1),
              variants: Array.from(new Set([...cur.variants, variant])),
            };
          }
          setUnmapped(nextUnmapped);
          setAttributes(data.attributes || []);
          setLastSync(data.syncedAt);
          saveCollection(accountId, {
            owned: next,
            unmapped: nextUnmapped,
            attributes: data.attributes || [],
            lastSync: data.syncedAt,
          });
          return next;
        });
        if (data.empty) {
          toast(
            "Synced, but Epic returned no Sprite data yet — you can still track by tapping cards.",
            true
          );
        } else if (!silent) {
          toast(`Synced ${data.items.length} Sprite items from Epic`);
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

  // Boot: who am I? Then cache-first render, then background sync.
  useEffect(() => {
    (async () => {
      try {
        const me = await api("/api/auth/me", { method: "GET" });
        setAuth({ state: "in", ...me });
        hydrateFromCache(me.accountId);
        if (!syncedOnce.current) {
          syncedOnce.current = true;
          sync(me.accountId, { silent: true });
        }
      } catch {
        setAuth({ state: "out" });
      }
    })();
  }, [hydrateFromCache, sync]);

  // Persist manual edits too.
  useEffect(() => {
    if (auth.state !== "in") return;
    saveCollection(auth.accountId, { owned, unmapped, attributes, lastSync });
  }, [owned, unmapped, attributes, lastSync, auth]);

  function tapCard(id) {
    setOwned((prev) => {
      const cur = prev[id];
      const next = { ...prev };
      if (!cur) next[id] = { level: 1, variants: ["Normal"] };
      else if (cur.level < 5) next[id] = { ...cur, level: cur.level + 1 };
      else delete next[id];
      return next;
    });
  }

  async function signOut() {
    try {
      await api("/api/auth/logout");
    } catch {}
    setAuth({ state: "out" });
    setOwned({});
    setUnmapped([]);
    setAttributes([]);
    setLastSync(null);
    syncedOnce.current = false;
    toast("Signed out — your Epic access was revoked.");
  }

  const collectedCount = useMemo(
    () => CATALOG.filter((c) => owned[c.id]).length,
    [owned]
  );

  const visible = useMemo(
    () =>
      CATALOG.filter((c) => {
        if (filter === "owned" && !owned[c.id]) return false;
        if (filter === "needed" && owned[c.id]) return false;
        if (element && c.element !== element) return false;
        return true;
      }),
    [filter, element, owned]
  );

  const elements = ["fire", "water", "earth", "mythic", "other"];

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
              <span className="hud-eyebrow">Sprite Ledger</span>
              <button className="acct-name" onClick={signOut}>
                {auth.displayName} · Sign out
              </button>
            </div>
            <div className="hud-count">
              {collectedCount}
              <small> / {CATALOG.length} extracted</small>
            </div>
            <div
              className="dustbar"
              aria-label={`${collectedCount} of ${CATALOG.length} sprites collected`}
            >
              {CATALOG.map((c, i) => (
                <span key={c.id} className={i < collectedCount ? "lit" : ""} />
              ))}
            </div>
            <div className="chips">
              {["needed", "owned", "all"].map((f) => (
                <button
                  key={f}
                  className={`chip ${filter === f ? "on" : ""}`}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f === "needed" ? "Still needed" : "Owned"}
                </button>
              ))}
              {elements.map((e) => (
                <button
                  key={e}
                  className={`chip ${element === e ? "on" : ""}`}
                  onClick={() => setElement(element === e ? null : e)}
                >
                  {e[0].toUpperCase() + e.slice(1)}
                </button>
              ))}
            </div>
          </header>

          {visible.length === 0 ? (
            <div className="empty">
              {filter === "needed" && collectedCount === CATALOG.length
                ? "Full collection. Go touch grass, Guardian."
                : "Nothing matches this filter."}
            </div>
          ) : (
            <div className="grid">
              {visible.map((c) => {
                const o = owned[c.id];
                return (
                  <button
                    key={c.id}
                    className={`card ${o ? "owned" : "needed"}`}
                    style={{ "--accent": `var(--${c.element})` }}
                    onClick={() => tapCard(c.id)}
                    aria-pressed={!!o}
                  >
                    {o?.level === 5 && <span className="mastered">MASTERED</span>}
                    <div className="orb" aria-hidden="true" />
                    <h3>{c.name}</h3>
                    <div className="tier">{c.tier}</div>
                    <div
                      className="pips"
                      aria-label={o ? `Level ${o.level} of 5` : "Not owned"}
                    >
                      {[1, 2, 3, 4, 5].map((lv) => (
                        <i key={lv} className={o && lv <= o.level ? "lit" : ""} />
                      ))}
                    </div>
                    <div className="vdots" aria-hidden="true">
                      {VARIANTS.map((v) => (
                        <b
                          key={v}
                          className={o?.variants?.includes(v) ? "have" : ""}
                          title={v}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {unmapped.length > 0 && (
            <>
              <div className="section-label">New from Epic — not in catalog yet</div>
              {unmapped.map((u) => (
                <div className="raw" key={u.itemId}>
                  <b>{u.templateId}</b>
                  <div>qty {u.quantity} · {u.profileId}</div>
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
              {syncing ? "Syncing…" : "Sync from Epic"}
            </button>
          </div>
          {lastSync && (
            <div className="sync-status">
              Last synced {new Date(lastSync).toLocaleString()}
            </div>
          )}
        </>
      )}
    </main>
  );
}
