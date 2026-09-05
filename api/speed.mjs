/**
 * /api/speed
 *
 * GET  ?bytes=N  -> N bytes of incompressible data, for a download measurement
 * POST           -> discards the body and reports how many bytes arrived
 * HEAD           -> near-empty response, for a latency measurement
 *
 * The payload is random rather than zero-filled on purpose. Zeros compress to
 * almost nothing in transit, which would report a download speed many times
 * higher than the connection can actually carry.
 */

import { randomFillSync } from "node:crypto";

const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_BYTES = 3 * 1024 * 1024;
const CHUNK = 64 * 1024;

/** Build a buffer of random bytes without paying for a fresh draw per byte. */
function payload(size) {
  const seed = Buffer.allocUnsafe(CHUNK);
  randomFillSync(seed);
  const out = Buffer.allocUnsafe(size);
  for (let at = 0; at < size; at += CHUNK) {
    seed.copy(out, at, 0, Math.min(CHUNK, size - at));
    // Shift the window each pass so the stream is not one block repeated,
    // which some middleboxes would happily deduplicate.
    seed[at % CHUNK] = (seed[at % CHUNK] + 1) & 0xff;
  }
  return out;
}

function baseHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  // A cached response would be read from disk in microseconds and reported as
  // an impossibly fast connection, so every layer has to be told not to keep it.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } }
};

export default async function handler(req, res) {
  baseHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    let bytes = parseInt(req.query.bytes, 10);
    if (!Number.isFinite(bytes) || bytes <= 0) bytes = DEFAULT_BYTES;
    bytes = Math.min(bytes, MAX_BYTES);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(bytes));
    // Compression would defeat the measurement even on random data, since the
    // encoder still costs time and the ratio varies per connection.
    res.setHeader("Content-Encoding", "identity");
    return res.status(200).send(payload(bytes));
  }

  if (req.method === "POST") {
    let received = 0;
    for await (const chunk of req) received += chunk.length;
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ received });
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
