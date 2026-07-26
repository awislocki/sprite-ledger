"use client";

// Row components shared by the signed-in ledger (app/page.js) and the public
// share page (app/s/[code]/page.js) so both render the identical interface.
//
// `readOnly` drives the public variant: no tap targets, and labels/counts
// speak in have/need terms because a shared collection code carries one bit
// per variant — it can't distinguish mastered from found.

import { useEffect, useRef, useState } from "react";
import { spriteImage } from "../lib/catalog.js";

export const Crown = () => (
  <svg className="crown" viewBox="0 0 24 17" role="img" aria-label="Mastered — level 5">
    <path d="M2 14 L1 3.5 L7.2 7.8 L12 1 L16.8 7.8 L23 3.5 L22 14 Z" />
    <rect x="3" y="15" width="18" height="2" rx="1" />
  </svg>
);

// Header accent per variant — matches the vtile gradient palette.
export const VARIANT_ACCENTS = {
  Normal: "#7e93ad",
  Gold: "#d4a93f",
  Gummy: "#f75fae",
  Galaxy: "#6d4bd8",
  Gem: "#3fa9e0",
  Holofoil: "#e8b7d4",
  Cube: "#8a3df0",
  Quack: "#ffb347",
};

// True while the element sits in the middle band of the viewport — drives
// the hero image's black&white → colour reveal as rows scroll through.
// A healthy IntersectionObserver always delivers an initial entry; if none
// arrives (or IO is missing), fall back to permanently coloured rather than
// leaving heroes grey forever.
export function useCenterFocus() {
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

// Shared count line: "N mastered · +M found / T", or "N have / T" read-only.
function RowCount({ stats, readOnly }) {
  const have = stats.mastered + stats.found;
  const allMastered = stats.mastered > 0 && stats.mastered === stats.total;
  if (readOnly)
    return (
      <span className="srow-count">
        <b className={have === stats.total ? "done" : ""}>{have}</b>
        <small> have</small>
        <small> / {stats.total}</small>
      </span>
    );
  return (
    <span className="srow-count">
      <b className={allMastered ? "done" : ""}>{stats.mastered}</b>
      <small> mastered</small>
      {stats.found > 0 && <em> · +{stats.found} found</em>}
      <small> / {stats.total}</small>
    </span>
  );
}

/* ---------------- Sprite row (one per sprite) ---------------- */

export function SpriteRow({ sprite: s, tiles, stats, tileInfo, onToggle, readOnly }) {
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
        className="srow-hero"
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
          {!readOnly && s.manualOnly && (
            <span className="prov-badge" title="Not in Epic's sync — track it manually">
              manual
            </span>
          )}
        </h3>
        <RowCount stats={stats} readOnly={readOnly} />
      </div>
      <div className="vstrip">
        {tiles.map((v) => {
          const { state, sync, source, toggleable } = tileInfo(s.slug, v);
          const vname = v === "Normal" ? "Base" : v;
          const nextHint =
            state === "missing"
              ? "tap: mark found"
              : state === "found"
              ? "tap: mark mastered"
              : sync === "found"
              ? "tap: mark not found" // suppress the Epic signal
              : "tap: clear";
          const label = readOnly
            ? `${vname} · ${state === "missing" ? "needs it" : "has it"}`
            : `${vname} · ${
                state === "mastered"
                  ? source === "sync"
                    ? "mastered"
                    : `mastered (manual) — ${nextHint}`
                  : state === "found"
                  ? source === "sync"
                    ? `found (from Epic) — ${nextHint}`
                    : `found — ${nextHint}`
                  : source === "manual"
                  ? `not found (overriding Epic) — ${nextHint}`
                  : `not found — ${nextHint}`
              }`;
          const Tag = toggleable ? "button" : "div";
          return (
            <Tag
              key={v}
              role={toggleable ? undefined : "img"}
              className={`vtile ${state} vv-${v.toLowerCase()} ${
                state === "mastered" ? "vmastered" : ""
              } ${toggleable ? "tappable" : ""}`}
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
                {/* the "+" invites a tap — pointless on a read-only page */}
                {state === "missing" && !readOnly && (
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

/* ---------------- Variant row (group-by-variant view) ---------------- */

// One row per variant style; tiles are display-only (no tap), filled
// edge-to-edge by the sprite art — colour when owned, B&W when missing.
export function VariantRow({ variant, tiles, stats, readOnly }) {
  const vname = variant === "Normal" ? "Base" : variant;
  const have = stats.mastered + stats.found;
  const allMastered = stats.mastered > 0 && stats.mastered === stats.total;
  return (
    <section
      className={`srow vrow vv-${variant.toLowerCase()} ${
        have > 0 ? "started" : "untouched"
      } ${allMastered ? "mastered" : ""}`}
      style={{ "--accent": VARIANT_ACCENTS[variant] || "var(--dust)" }}
    >
      <div className="srow-head">
        <h3>{vname}</h3>
        <RowCount stats={stats} readOnly={readOnly} />
      </div>
      <div className="fstrip">
        {tiles.map(({ sprite: s, state }) => {
          const label = readOnly
            ? `${s.name} ${vname} — ${state === "missing" ? "needs it" : "has it"}`
            : `${s.name} ${vname} — ${state === "missing" ? "not found" : state}`;
          return (
            <div key={s.slug} role="img" className={`ftile ${state}`} title={label} aria-label={label}>
              <span className="ftile-img">
                <img
                  src={spriteImage(s, variant)}
                  alt=""
                  loading="lazy"
                  width={72}
                  height={72}
                />
              </span>
              {state === "mastered" && (
                <span className="vcrown" aria-hidden="true">
                  <Crown />
                </span>
              )}
              {state === "found" && (
                <span className="vcaught" aria-hidden="true">
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
