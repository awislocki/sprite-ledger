// Read/write PNG tEXt chunks — how a share image carries the collection code
// that produced it.
//
// The trade room asks players to upload their collection image. Reading the
// sprites back out of the pixels would mean OCR and guesswork; instead the
// renderer stamps the exact collection code into the file's metadata, so an
// upload decodes to precisely the collection the image was made from. Costs
// ~70 bytes and changes nothing visible.
//
// Caveat worth knowing: chat apps that re-encode an image (or a screenshot of
// one) drop metadata. That's fine for the intended flow — a player generates
// their own image and uploads that file — and every room also accepts a
// pasted code, which is the recovery path.
//
// Pure byte manipulation, no dependencies, runs in the browser and in node.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const isPng = (b) => SIGNATURE.every((v, i) => b[i] === v);
const readU32 = (b, at) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const chunkType = (b, at) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

// Walks the chunk list, calling visit(type, dataStart, dataLength, chunkStart).
// Returning a value from visit stops the walk and returns it.
function walk(bytes, visit) {
  let at = 8;
  while (at + 8 <= bytes.length) {
    const len = readU32(bytes, at);
    const type = chunkType(bytes, at + 4);
    const out = visit(type, at + 8, len, at);
    if (out !== undefined) return out;
    if (type === "IEND") return undefined;
    at += 12 + len; // length + type + data + crc
  }
  return undefined;
}

// Returns the tEXt value stored under `keyword`, or null.
export function readPngText(bytes, keyword) {
  if (!bytes || bytes.length < 12 || !isPng(bytes)) return null;
  const found = walk(bytes, (type, start, len) => {
    if (type !== "tEXt") return undefined;
    let sep = start;
    const end = start + len;
    while (sep < end && bytes[sep] !== 0) sep++;
    let key = "";
    for (let i = start; i < sep; i++) key += String.fromCharCode(bytes[i]);
    if (key !== keyword) return undefined;
    let value = "";
    for (let i = sep + 1; i < end; i++) value += String.fromCharCode(bytes[i]);
    return value;
  });
  return found ?? null;
}

// Returns a copy of `bytes` with a tEXt chunk inserted before IEND. Any
// existing chunk with the same keyword is left alone — readPngText takes the
// first, so callers should only stamp a fresh render.
export function writePngText(bytes, keyword, value) {
  if (!isPng(bytes)) throw new Error("not a PNG");
  const iend = walk(bytes, (type, _s, _l, chunkStart) =>
    type === "IEND" ? chunkStart : undefined
  );
  if (iend === undefined) throw new Error("PNG has no IEND chunk");

  // tEXt payload is keyword \0 value, both Latin-1. Collection codes are
  // base64url + dots + a sanitised name, so they're already ASCII.
  const payload = `${keyword}\0${value}`;
  const data = Uint8Array.from(payload, (c) => c.charCodeAt(0) & 0xff);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(bytes.subarray(iend), iend + chunk.length);
  return out;
}

// The keyword every FMDS share image uses.
export const FMDS_CODE_KEY = "fmds-collection";
