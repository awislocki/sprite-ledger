// Renders a shareable PNG of a set of sprite variants (missing or owned)
// entirely client-side. fortnite-api.com serves images with
// Access-Control-Allow-Origin: * (verified 2026-07-19), so crossOrigin
// canvas drawing is clean; the logo is same-origin.

import { SPRITES, spriteVariants, spriteImage } from "./catalog.js";

const W = 1000;
const PAD = 28;
const TILE = 92;
const TILE_IMG = 62;
const TILE_GAP = 10;
const ROW_HEAD = 34;
const ROW_GAP = 16;
const HEADER_H = 132;
const FOOTER_H = 52;

const COLORS = {
  bg: "#0b0e15",
  panel: "#151b29",
  panelLine: "#232c42",
  ink: "#e9edf6",
  slate: "#7e89a3",
  dust: "#e8c069",
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// keys: ["slug:Variant", ...] to include. Returns a PNG Blob.
export async function renderShareImage({ title, subtitle, keys }) {
  const wanted = new Set(keys);
  const sections = SPRITES.map((s) => ({
    sprite: s,
    variants: spriteVariants(s).filter((v) => wanted.has(`${s.slug}:${v}`)),
  })).filter((sec) => sec.variants.length > 0);

  const perLine = Math.floor((W - PAD * 2 + TILE_GAP) / (TILE + TILE_GAP));
  let height = HEADER_H;
  for (const sec of sections) {
    const lines = Math.ceil(sec.variants.length / perLine);
    height += ROW_HEAD + lines * (TILE + 26 + TILE_GAP) + ROW_GAP;
  }
  height += FOOTER_H;

  // Render at 2x (or the device's ratio if higher) — a 1x canvas comes out
  // grainy on every modern screen once the share sheet rescales it.
  const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, height);

  // Canvas ignores CSS @font-face fallbacks silently — make sure the display
  // font is actually loaded before drawing text (best-effort).
  try {
    await Promise.all(
      ["700 30px", "600 20px", "600 16px", "700 11px"].map((f) =>
        document.fonts.load(`${f} 'Chakra Petch'`)
      )
    );
  } catch {}

  // Header
  try {
    const logo = await loadImage("/logo.png");
    const lh = 78;
    ctx.drawImage(logo, PAD, 26, (logo.width / logo.height) * lh, lh);
  } catch {
    // logo is cosmetic — keep rendering
  }
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.ink;
  ctx.font = "700 30px 'Chakra Petch', system-ui, sans-serif";
  ctx.fillText(title.toUpperCase(), W - PAD, 62);
  ctx.fillStyle = COLORS.slate;
  ctx.font = "600 16px 'Chakra Petch', system-ui, sans-serif";
  ctx.fillText(subtitle, W - PAD, 90);

  // Preload every needed variant image (deduped). Individual failures render
  // as empty panels, but if nothing loaded the image would be useless — bail
  // with a real error instead.
  const imgCache = new Map();
  await Promise.all(
    sections.flatMap((sec) =>
      sec.variants.map(async (v) => {
        const url = spriteImage(sec.sprite, v);
        if (!imgCache.has(url)) {
          imgCache.set(url, await loadImage(url).catch(() => null));
        }
      })
    )
  );
  if (![...imgCache.values()].some(Boolean))
    throw new Error("sprite art wouldn't load — check your connection");

  let y = HEADER_H;
  for (const sec of sections) {
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "600 20px 'Chakra Petch', system-ui, sans-serif";
    ctx.fillText(sec.sprite.name, PAD, y + 20);
    ctx.fillStyle = COLORS.slate;
    ctx.font = "600 14px 'Chakra Petch', system-ui, sans-serif";
    ctx.fillText(
      `${sec.variants.length} of ${spriteVariants(sec.sprite).length}`,
      PAD + ctx.measureText(sec.sprite.name).width + 90,
      y + 20
    );
    y += ROW_HEAD;

    sec.variants.forEach((v, i) => {
      const col = i % perLine;
      const line = Math.floor(i / perLine);
      const x = PAD + col * (TILE + TILE_GAP);
      const ty = y + line * (TILE + 26 + TILE_GAP);

      ctx.fillStyle = COLORS.panel;
      ctx.strokeStyle = COLORS.panelLine;
      rounded(ctx, x, ty, TILE, TILE + 22, 10);
      ctx.fill();
      ctx.stroke();

      const img = imgCache.get(spriteImage(sec.sprite, v));
      if (img)
        ctx.drawImage(img, x + (TILE - TILE_IMG) / 2, ty + 8, TILE_IMG, TILE_IMG);

      ctx.textAlign = "center";
      ctx.fillStyle = v === "Gold" ? COLORS.dust : COLORS.slate;
      ctx.font = "700 11px 'Chakra Petch', system-ui, sans-serif";
      ctx.fillText(
        (v === "Normal" ? "Base" : v).toUpperCase(),
        x + TILE / 2,
        ty + TILE + 12
      );
    });

    const lines = Math.ceil(sec.variants.length / perLine);
    y += lines * (TILE + 26 + TILE_GAP) + ROW_GAP;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.slate;
  ctx.font = "600 14px 'Chakra Petch', system-ui, sans-serif";
  ctx.fillText(
    "FMDS Fortnite Sprite Tracker — sprite-ledger.vercel.app",
    W / 2,
    height - 22
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("couldn't render image"))),
      "image/png"
    )
  );
}

export async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancelled";
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
