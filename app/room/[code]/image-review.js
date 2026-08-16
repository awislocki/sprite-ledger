"use client";

// Confirm what the reader saw before it becomes somebody's collection.
//
// This step is not optional politeness — a misread tile, or a missing-list that
// was only a partial screenshot, would put sprites in a player's collection
// they don't own, and the round would ask them to hand one over. So the reading
// is shown as something to correct: every tile can be dropped, the have/missing
// reading can be flipped, and nothing is submitted until a name is typed.
//
// Worded for whoever is holding the phone, which may not be the player being
// added — one person often seats the whole room.

import { useMemo, useState } from "react";
import {
  SLUG_LOOKUP,
  TOTAL_VARIANTS,
  spriteImage,
} from "../../../lib/catalog.js";
import { fromKey, ownedFromReading } from "../../../lib/vision-catalog.js";
import { encodeCode } from "../../../lib/share.js";

const keyImage = (key) => {
  const [slug, variant] = key.split(":");
  const sprite = SLUG_LOOKUP[slug];
  return sprite ? spriteImage(sprite, variant) : "";
};

export default function ImageReview({ reading, busy, onCancel, onConfirm }) {
  const [kind, setKind] = useState(
    reading.listKind === "unclear" ? null : reading.listKind
  );
  const [dropped, setDropped] = useState(() => new Set());
  const [name, setName] = useState("");

  const kept = useMemo(
    () => reading.keys.filter((k) => !dropped.has(k)),
    [reading.keys, dropped]
  );
  const owned = useMemo(
    () => (kind ? ownedFromReading(kept, kind) : []),
    [kept, kind]
  );

  const toggle = (key) =>
    setDropped((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const ready = Boolean(kind) && name.trim().length > 0 && kept.length > 0;

  return (
    <div className="room-join review">
      <div className="section-label">Check the reading</div>

      <p className="field-hint">
        Read {reading.keys.length} sprite{reading.keys.length === 1 ? "" : "s"}
        {reading.unreadable > 0 && ` · ${reading.unreadable} tile${
          reading.unreadable === 1 ? "" : "s"
        } couldn't be identified`}
        {reading.heading && ` · heading: “${reading.heading}”`}
      </p>

      <div className="review-kind">
        <span>This player</span>
        <div className="chips">
          <button
            className={`chip ${kind === "owned" ? "on" : ""}`}
            aria-pressed={kind === "owned"}
            onClick={() => setKind("owned")}
          >
            has these
          </button>
          <button
            className={`chip ${kind === "missing" ? "on" : ""}`}
            aria-pressed={kind === "missing"}
            onClick={() => setKind("missing")}
          >
            still needs these
          </button>
        </div>
      </div>

      {kind === null && (
        <div className="alert" role="alert">
          The image doesn&rsquo;t say whether these are sprites this player has
          or ones they&rsquo;re after — pick one before adding them.
        </div>
      )}

      {kind === "missing" && (
        <div className="alert" role="alert">
          A &ldquo;still needs&rdquo; list means everything else counts as
          theirs: <b>{owned.length} of {TOTAL_VARIANTS}</b> collected. If this
          picture only showed part of their missing list, use their collection
          code instead — otherwise they may be asked to hand over a sprite they
          don&rsquo;t have.
        </div>
      )}

      <div className="review-tiles">
        {reading.keys.map((key) => {
          const info = fromKey(key);
          if (!info) return null;
          const off = dropped.has(key);
          const unsure = reading.unsure.includes(key);
          return (
            <button
              key={key}
              className={`review-tile ${off ? "off" : ""} ${unsure ? "unsure" : ""}`}
              aria-pressed={!off}
              onClick={() => toggle(key)}
              title={off ? "Put this one back" : "Not mine — drop it"}
            >
              <img
                src={keyImage(key)}
                alt=""
                width={34}
                height={34}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <em>
                {info.variant}
                <br />
                <b>{info.sprite}</b>
              </em>
            </button>
          );
        })}
      </div>
      <p className="field-hint">
        Tap any tile the reader got wrong to drop it
        {reading.unsure.length === 1 && " — the one marked with a dot was its least confident guess"}
        {reading.unsure.length > 1 &&
          ` — the ${reading.unsure.length} marked with a dot were its least confident guesses`}
        .
      </p>

      <div className="share-compare-row">
        <input
          id="review-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name for this player"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
        />
        <button
          className="btn-step"
          disabled={!ready || busy}
          onClick={() => onConfirm(encodeCode(new Set(owned), name.trim()), name.trim())}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      <button className="linklike" onClick={onCancel}>
        ← Use a different image, or paste a code
      </button>
    </div>
  );
}
