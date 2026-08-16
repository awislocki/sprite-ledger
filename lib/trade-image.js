// Shareable PNG of one trade round: who hands what to whom.
//
// Two card shapes, chosen by circle length — a two-player swap gets a wide
// face-off card (the headline case), three-plus get a chain card with one
// line per hand-off. Both are drawn at phone-legible sizes: this image is
// made to be dropped into a group chat and read without zooming.

import { spriteImage } from "./catalog.js";
import {
  COLORS,
  loadImage,
  rounded,
  beginCanvas,
  toPngBlob,
  loadDisplayFont,
  variantGradient,
  variantInk,
  variantLabel,
} from "./share-canvas.js";

const W = 1000;
const PAD = 28;
const CARD_W = W - PAD * 2;
const HEADER_H = 132;
const META_H = 34;
const CARD_GAP = 16;
const SWAP_H = 256;
const CHAIN_HEAD = 46;
const CHAIN_LINE = 108;
const CHAIN_TAIL = 14;
const SITOUT_H = 46;
const FOOTER_H = 56;

const display = (weight, size) =>
  `${weight} ${size}px 'Chakra Petch', system-ui, sans-serif`;

const cardHeight = (circle) =>
  circle.players.length === 2
    ? SWAP_H
    : CHAIN_HEAD + circle.players.length * CHAIN_LINE + CHAIN_TAIL;

// Draw `text` at `size`, shrinking (down to 11px) and then clipping with an
// ellipsis rather than letting a long Epic display name run into the art.
function fitText(ctx, text, x, y, maxW, { size, weight = 600, color, align = "left" }) {
  let s = size;
  ctx.font = display(weight, s);
  while (ctx.measureText(text).width > maxW && s > 11) {
    s -= 1;
    ctx.font = display(weight, s);
  }
  let out = text;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxW)
    out = out.slice(0, -1);
  if (out !== text) out += "…";
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(out, x, y);
  return ctx.measureText(out).width;
}

function pill(ctx, text, x, y, color) {
  ctx.font = display(700, 11);
  const w = ctx.measureText(text).width + 20;
  ctx.fillStyle = `${color}22`;
  ctx.strokeStyle = `${color}66`;
  ctx.lineWidth = 1;
  rounded(ctx, x, y, w, 22, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(text, x + 10, y + 15);
}

// Horizontal arrow from x1 to x2 (either direction), head at x2.
function arrow(ctx, x1, x2, y, color, width = 2) {
  const dir = Math.sign(x2 - x1) || 1;
  const head = 9;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2 - dir * head, y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y);
  ctx.lineTo(x2 - dir * head, y - head * 0.62);
  ctx.lineTo(x2 - dir * head, y + head * 0.62);
  ctx.closePath();
  ctx.fill();
}

// A sprite tile in its variant's colours — the same read as the app's .vv-*
// tiles, flattened for canvas.
function tile(ctx, img, variant, cx, top, size) {
  const x = cx - size / 2;
  const art = Math.round(size * 0.74);
  ctx.save();
  rounded(ctx, x, top, size, size, size * 0.16);
  ctx.fillStyle = variantGradient(ctx, variant, x, top, size, size);
  ctx.globalAlpha = 0.42;
  ctx.fill();
  ctx.restore();
  rounded(ctx, x, top, size, size, size * 0.16);
  ctx.strokeStyle = variantInk(variant);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (img)
    ctx.drawImage(img, cx - art / 2, top + (size - art) / 2, art, art);
}

function swapCard(ctx, circle, round, images, y) {
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelLine;
  ctx.lineWidth = 1;
  rounded(ctx, PAD, y, CARD_W, SWAP_H, 18);
  ctx.fill();
  ctx.stroke();
  pill(ctx, "STRAIGHT SWAP", PAD + 20, y + 18, COLORS.dust);

  const [a, b] = circle.trades;
  const cx = PAD + CARD_W / 2;
  const spots = [
    { trade: a, cx: PAD + CARD_W * 0.27 },
    { trade: b, cx: PAD + CARD_W * 0.73 },
  ];

  const textW = CARD_W * 0.36;
  for (const { trade, cx: gx } of spots) {
    const player = round.players[trade.from];
    fitText(ctx, player.name, gx, y + 72, textW, {
      size: 24,
      weight: 700,
      color: COLORS.ink,
      align: "center",
    });
    ctx.font = display(700, 10);
    ctx.fillStyle = COLORS.slate;
    ctx.textAlign = "center";
    ctx.fillText("HANDS OVER", gx, y + 90);

    tile(ctx, images.get(trade.key), trade.variant, gx, y + 100, 96);

    // Variant above name, matching the chain card's "GEM Duck" reading order.
    fitText(ctx, variantLabel(trade.variant).toUpperCase(), gx, y + 219, textW, {
      size: 14,
      weight: 700,
      color: variantInk(trade.variant),
      align: "center",
    });
    fitText(ctx, trade.sprite?.name || trade.key, gx, y + 241, textW, {
      size: 20,
      weight: 700,
      color: COLORS.ink,
      align: "center",
    });
  }

  // The crossing arrows: each player's sprite travels to the other.
  ctx.fillStyle = COLORS.panelHi;
  ctx.strokeStyle = COLORS.panelLine;
  ctx.beginPath();
  ctx.arc(cx, y + 148, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  arrow(ctx, cx - 26, cx + 26, y + 138, COLORS.get, 2.5);
  arrow(ctx, cx + 26, cx - 26, y + 160, COLORS.get, 2.5);
}

function chainCard(ctx, circle, round, images, y) {
  const h = cardHeight(circle);
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelLine;
  ctx.lineWidth = 1;
  rounded(ctx, PAD, y, CARD_W, h, 18);
  ctx.fill();
  ctx.stroke();
  pill(ctx, `CHAIN · ${circle.players.length} PLAYERS`, PAD + 20, y + 18, COLORS.dust);
  ctx.font = display(600, 12);
  ctx.fillStyle = COLORS.slate;
  ctx.textAlign = "right";
  ctx.fillText("pass it round the circle", PAD + CARD_W - 20, y + 33);

  const cx = PAD + CARD_W / 2;
  circle.trades.forEach((trade, i) => {
    const ly = y + CHAIN_HEAD + i * CHAIN_LINE;
    const mid = ly + 40;

    tile(ctx, images.get(trade.key), trade.variant, cx, ly + 2, 74);

    // Caption under the tile: variant in its own colour, sprite name in ink.
    const vt = `${variantLabel(trade.variant).toUpperCase()} `;
    ctx.font = display(700, 12);
    const vw = ctx.measureText(vt).width;
    ctx.font = display(600, 14);
    const nw = ctx.measureText(trade.sprite?.name || trade.key).width;
    const startX = cx - (vw + nw) / 2;
    ctx.textAlign = "left";
    ctx.font = display(700, 12);
    ctx.fillStyle = variantInk(trade.variant);
    ctx.fillText(vt, startX, ly + 94);
    ctx.font = display(600, 14);
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(trade.sprite?.name || trade.key, startX + vw, ly + 94);

    fitText(ctx, round.players[trade.from].name, cx - 76, mid, CARD_W / 2 - 130, {
      size: 20,
      weight: 700,
      color: COLORS.ink,
      align: "right",
    });
    fitText(ctx, round.players[trade.to].name, cx + 76, mid, CARD_W / 2 - 130, {
      size: 20,
      weight: 700,
      color: COLORS.ink,
      align: "left",
    });
    arrow(ctx, cx - 66, cx - 42, mid - 6, COLORS.give);
    arrow(ctx, cx + 42, cx + 66, mid - 6, COLORS.get);
  });
}

/**
 * @param round  the object planTradeRound() returns
 * @param label  optional subtitle suffix (e.g. a date or group name)
 * @returns PNG Blob
 */
export async function renderTradeRoundImage({ round, label }) {
  if (!round?.trades.length)
    throw new Error("Nobody in this group can trade yet — add another player.");

  let height = HEADER_H + META_H;
  for (const c of round.circles) height += cardHeight(c) + CARD_GAP;
  if (round.sitOut.length) height += SITOUT_H + CARD_GAP;
  height += FOOTER_H;

  const { canvas, ctx } = beginCanvas(W, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, height);
  await loadDisplayFont(["700 30px", "700 24px", "600 19px", "700 12px", "700 10px"]);

  // Header — logo left, title right, mirroring the missing/owned image.
  try {
    const logo = await loadImage("/logo.png");
    const lh = 78;
    ctx.drawImage(logo, PAD, 26, (logo.width / logo.height) * lh, lh);
  } catch {
    // logo is cosmetic — keep rendering
  }
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.ink;
  ctx.font = display(700, 30);
  ctx.fillText("TRADE ROUND", W - PAD, 62);
  ctx.fillStyle = COLORS.slate;
  ctx.font = display(600, 16);
  const players = round.players.length - round.sitOut.length;
  ctx.fillText(
    `${players} players · ${round.trades.length} trades${label ? ` · ${label}` : ""}`,
    W - PAD,
    90
  );

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.dust;
  ctx.font = display(700, 12);
  ctx.fillText("EVERYONE GIVES ONE · EVERYONE GETS ONE THEY DON'T HAVE", PAD, HEADER_H + 8);

  // Preload every gifted sprite. Individual failures leave an empty tile;
  // nothing loading at all would make a useless image, so that's an error.
  const images = new Map();
  await Promise.all(
    round.trades.map(async (t) => {
      if (!t.sprite || images.has(t.key)) return;
      images.set(t.key, null);
      images.set(t.key, await loadImage(spriteImage(t.sprite, t.variant)).catch(() => null));
    })
  );
  if (![...images.values()].some(Boolean))
    throw new Error("sprite art wouldn't load — check your connection");

  let y = HEADER_H + META_H;
  for (const circle of round.circles) {
    if (circle.players.length === 2) swapCard(ctx, circle, round, images, y);
    else chainCard(ctx, circle, round, images, y);
    y += cardHeight(circle) + CARD_GAP;
  }

  if (round.sitOut.length) {
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.panelLine;
    ctx.lineWidth = 1;
    rounded(ctx, PAD, y, CARD_W, SITOUT_H, 14);
    ctx.fill();
    ctx.stroke();
    const names = round.sitOut.map((i) => round.players[i].name).join(", ");
    fitText(
      ctx,
      `${names} sat out — no one here has a sprite they still need`,
      PAD + 20,
      y + 28,
      CARD_W - 40,
      { size: 14, weight: 600, color: COLORS.slate }
    );
    y += SITOUT_H + CARD_GAP;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.slate;
  ctx.font = display(600, 14);
  ctx.fillText(
    "FMDS Fortnite Sprite Tracker — sprite-ledger.vercel.app",
    W / 2,
    height - 22
  );

  return toPngBlob(canvas);
}
