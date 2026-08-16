// Canvas primitives shared by the share-image renderers (the missing/owned
// list in share-image.js and the trade-round card in trade-image.js).
// Browser-only — every export here touches document/window.

import { writePngText, FMDS_CODE_KEY } from "./png-text.js";

export const COLORS = {
  bg: "#0b0e15",
  panel: "#151b29",
  panelHi: "#1c2436",
  panelLine: "#232c42",
  ink: "#e9edf6",
  slate: "#7e89a3",
  dust: "#e8c069",
  give: "#ff7847",
  get: "#8fcb57",
};

// fortnite-api.com serves images with Access-Control-Allow-Origin: *
// (verified 2026-07-19), so crossOrigin canvas drawing stays clean; the logo
// and the self-hosted /sprites art are same-origin.
//
// A request that STALLS (rather than failing) fires neither onload nor
// onerror, which would leave the render promise pending forever and the
// share button stuck on "Rendering…" — so every load is capped. Callers
// treat a rejection as a blank tile.
export function loadImage(src, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(
      () => reject(new Error(`image timed out: ${src}`)),
      timeoutMs
    );
    const done = (fn, arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    img.crossOrigin = "anonymous";
    img.onload = () => done(resolve, img);
    img.onerror = () => done(reject, new Error(`image failed: ${src}`));
    img.src = src;
  });
}

export function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Render at 2x (or the device's ratio if higher) — a 1x canvas comes out
// grainy on every modern screen once the share sheet rescales it.
export function beginCanvas(w, h) {
  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export function toPngBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("couldn't render image"))),
      "image/png"
    )
  );
}

// Stamp the collection code that produced this image into the PNG's metadata,
// so uploading the file to a trade room decodes to the exact collection
// instead of being read off the pixels. Never fatal: an image that can't be
// stamped is still a perfectly good image.
export async function stampCode(blob, code) {
  if (!code) return blob;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return new Blob([writePngText(bytes, FMDS_CODE_KEY, code)], {
      type: "image/png",
    });
  } catch {
    return blob;
  }
}

// Canvas ignores CSS @font-face fallbacks silently — make sure the display
// font is actually loaded before drawing text (best-effort).
//
// When the webfont stylesheet itself never arrives (flaky mobile connection,
// blocked CDN), document.fonts.load() stays pending indefinitely instead of
// rejecting. Race it: after the cap we draw in the system fallback, which is
// far better than a share button that never finishes.
export async function loadDisplayFont(specs, timeoutMs = 2000) {
  try {
    await Promise.race([
      Promise.all(specs.map((f) => document.fonts.load(`${f} 'Chakra Petch'`))),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {}
}

// Flattened stand-ins for the .vv-* tile gradients in globals.css — canvas
// has no conic gradients or multi-layer backgrounds, so Gem/Holofoil/Galaxy
// keep their palette but lose the sparkle. Order: highlight, mid, shadow.
const VARIANT_STOPS = {
  Normal: ["#b9c9dd", "#7e93ad", "#4d5f78"],
  Gold: ["#f6e09a", "#d4a93f", "#7c5f1c"],
  Gummy: ["#ffb3e0", "#f75fae", "#a52c6d"],
  Galaxy: ["#43307e", "#6d4bd8", "#120d2b"],
  Gem: ["#b8ecff", "#3fa9e0", "#2a6fa8"],
  Holofoil: ["#ffd9e8", "#d9fff3", "#fff3d9"],
  Cube: ["#8a3df0", "#4a1e8e", "#1c0b38"],
  Quack: ["#ffe08a", "#ffb347", "#d97e1f"],
};

export const variantStops = (variant) =>
  VARIANT_STOPS[variant] || VARIANT_STOPS.Normal;

// The mid stop doubles as the tile's ring colour and the variant caption ink.
export const variantInk = (variant) => variantStops(variant)[1];

export function variantGradient(ctx, variant, x, y, w, h) {
  const [hi, mid, lo] = variantStops(variant);
  const g = ctx.createLinearGradient(x, y, x + w * 0.55, y + h);
  g.addColorStop(0, hi);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, lo);
  return g;
}

export const variantLabel = (variant) =>
  variant === "Normal" ? "Base" : variant;
