// Best-effort in-memory per-key rate limit for the unauthenticated device
// endpoints. There's no shared store by design (no database), so on Vercel
// each warm serverless instance keeps its own counters — this throttles
// scripted bursts within an instance rather than enforcing a global cap.
// Paired with cookie-based poll-interval enforcement (see the poll route),
// it keeps request volume to Epic sane without new infrastructure.

const buckets = new Map();
let lastSweep = 0;

export function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

// Sliding window. Returns { ok } or { ok: false, retryAfter } (seconds).
export function rateLimit(key, { limit, windowMs }, now = Date.now()) {
  // Occasional cleanup so idle keys don't accumulate.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, arr] of buckets) {
      const live = arr.filter((t) => now - t < windowMs);
      if (live.length) buckets.set(k, live);
      else buckets.delete(k);
    }
  }
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true };
}
