"use client";

// Read-only public collection view. Everything it renders comes from the
// collection code in the URL — no auth, no Epic call, no server state. The
// code carries one bit per catalog variant, so this page speaks in
// has-it/needs-it terms (it can't know mastered vs found).

import { useCallback, useMemo, useState } from "react";
import { ALL_SPRITES, VARIANT_ORDER, spriteVariants } from "../../../lib/catalog.js";
import { decodeCode } from "../../../lib/share.js";
import { SpriteRow, VariantRow } from "../../ledger-rows.js";

export default function PublicLedger({ code }) {
  const [filter, setFilter] = useState("all"); // all | have | need
  const [groupBy, setGroupBy] = useState("sprite"); // sprite | variant

  // Decode once. A bad/old code yields a friendly explanation, never a crash.
  const { owned, name, error } = useMemo(() => {
    try {
      const d = decodeCode(code);
      return { owned: d.owned, name: d.name, error: null };
    } catch (err) {
      return { owned: new Set(), name: null, error: err.message };
    }
  }, [code]);

  const has = useCallback((slug, variant) => owned.has(`${slug}:${variant}`), [owned]);

  // Shaped like the signed-in ledger's tileInfo so the row components are
  // reused verbatim: everything is either "found" (has it) or "missing".
  const tileInfo = useCallback(
    (slug, variant) => {
      const state = has(slug, variant) ? "found" : "missing";
      return { state, sync: state, source: "sync", toggleable: false };
    },
    [has]
  );

  const spriteStats = useMemo(() => {
    const stats = {};
    for (const s of ALL_SPRITES) {
      const vs = spriteVariants(s);
      const found = vs.filter((v) => has(s.slug, v)).length;
      stats[s.slug] = { mastered: 0, found, total: vs.length };
    }
    return stats;
  }, [has]);

  const ownedTotal = useMemo(
    () => Object.values(spriteStats).reduce((n, s) => n + s.found, 0),
    [spriteStats]
  );
  const catalogTotal = useMemo(
    () => ALL_SPRITES.reduce((n, s) => n + spriteVariants(s).length, 0),
    []
  );

  const keep = useCallback(
    (slug, variant) => {
      if (filter === "have") return has(slug, variant);
      if (filter === "need") return !has(slug, variant);
      return true;
    },
    [filter, has]
  );

  const spriteRows = useMemo(
    () =>
      ALL_SPRITES.map((s) => ({
        sprite: s,
        tiles: spriteVariants(s).filter((v) => keep(s.slug, v)),
      }))
        .filter((row) => row.tiles.length > 0)
        .sort((a, b) => a.sprite.name.localeCompare(b.sprite.name)),
    [keep]
  );

  const variantRows = useMemo(() => {
    if (groupBy !== "variant") return [];
    const sprites = [...ALL_SPRITES].sort((a, b) => a.name.localeCompare(b.name));
    return VARIANT_ORDER.map((variant) => {
      const tiles = [];
      let found = 0;
      let total = 0;
      for (const s of sprites) {
        if (!s.variants[variant]) continue;
        total++;
        if (has(s.slug, variant)) found++;
        if (!keep(s.slug, variant)) continue;
        tiles.push({ sprite: s, state: has(s.slug, variant) ? "found" : "missing" });
      }
      return { variant, tiles, stats: { mastered: 0, found, total } };
    }).filter((row) => row.tiles.length > 0);
  }, [groupBy, has, keep]);

  if (error) {
    return (
      <main className="app">
        <div className="pub-head">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
        </div>
        <div className="alert" role="alert">
          {error}
        </div>
        <p className="fineprint">
          Collection links look like <b>/s/FMDS1.Name.xxxxx</b> — ask for a
          fresh one, or track your own collection below.
        </p>
        <div className="syncbar">
          <a className="btn-sync" href="/">
            Track my own Sprites
          </a>
        </div>
      </main>
    );
  }

  const rows = groupBy === "variant" ? variantRows : spriteRows;

  return (
    <main className="app">
      <header className="hud">
        <div className="acct">
          <span className="hud-eyebrow">
            <img src="/mascot.png" alt="" width={22} height={22} />
            FMDS Sprite Tracker
          </span>
          <span className="pub-badge">shared · view only</span>
        </div>
        <h1 className="pub-title">{name}&rsquo;s Sprites</h1>
        <div className="hud-countrow">
          <div className="hud-count">
            {ownedTotal}
            <small> / {catalogTotal} collected</small>
          </div>
          <button
            className={`chip group-toggle ${groupBy === "variant" ? "on" : ""}`}
            aria-pressed={groupBy === "variant"}
            onClick={() => setGroupBy(groupBy === "variant" ? "sprite" : "variant")}
          >
            By variant
          </button>
        </div>
        <div className="chips">
          {[
            ["all", "All"],
            ["have", `Has it (${ownedTotal})`],
            ["need", `Needs it (${catalogTotal - ownedTotal})`],
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

      {rows.length === 0 ? (
        <div className="empty">
          {filter === "need"
            ? `${name} has every Sprite. Nothing left to trade for.`
            : `${name} hasn't collected any Sprites yet.`}
        </div>
      ) : (
        <div className="rows">
          {groupBy === "variant"
            ? variantRows.map(({ variant, tiles, stats }) => (
                <VariantRow
                  key={variant}
                  variant={variant}
                  tiles={tiles}
                  stats={stats}
                  readOnly
                />
              ))
            : spriteRows.map(({ sprite: s, tiles }) => (
                <SpriteRow
                  key={s.slug}
                  sprite={s}
                  tiles={tiles}
                  stats={spriteStats[s.slug]}
                  tileInfo={tileInfo}
                  readOnly
                />
              ))}
        </div>
      )}

      <div className="pub-cta">
        <div className="section-label">Want to trade?</div>
        <p>
          Colour means {name} has it, black &amp; white means they need it. If
          you use the tracker too, load this collection against yours to see
          exactly what each of you can offer.
        </p>
        <a className="btn-sync" href={`/?compare=${encodeURIComponent(code)}`}>
          Compare with my collection
        </a>
        <a className="btn-step" href="/">
          New here? Track your own Sprites
        </a>
      </div>

      <p className="fineprint">
        This page is built entirely from the link — nothing about{" "}
        {name}&rsquo;s account is stored anywhere. Fan-made tool, not
        affiliated with Epic Games. Sprite images via fortnite-api.com.
      </p>
    </main>
  );
}
