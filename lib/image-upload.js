// Prepare a picked image for the reader. Browser-only.
//
// Claude's high-resolution vision tops out at 2576px on the long edge, and
// bills per image token, so sending a 12-megapixel phone photo costs more and
// reads no better than the downscale. Doing it here also keeps the upload
// small on a phone connection.

const MAX_EDGE = 2576;
const QUALITY = 0.92;

export async function prepareImage(file, maxEdge = MAX_EDGE) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Screenshots are often PNGs with transparency; JPEG has none, so flatten
    // onto the app's own background rather than letting it come out black.
    ctx.fillStyle = "#0b0e15";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1] };
  } finally {
    bitmap.close?.();
  }
}
