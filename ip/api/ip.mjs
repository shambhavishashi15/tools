/**
 * GET /api/ip
 *
 * Returns the caller's IP address plus geolocation, as flat JSON.
 * The provider token stays server-side and is never sent to the browser.
 *
 * Requires the IPINFO_TOKEN environment variable to be set in Vercel.
 */

const TOKEN = process.env.IPINFO_TOKEN;
const LOOKUP_TIMEOUT_MS = 3500;

/**
 * Work out who is actually calling.
 *
 * Vercel terminates TLS at the edge, so the socket address belongs to their
 * proxy, not the visitor. The real address arrives in x-forwarded-for as a
 * comma-separated chain, oldest first: "client, proxy1, proxy2".
 *
 * Only the leftmost entry is the client, and only because Vercel rewrites this
 * header rather than appending to whatever the caller sent. Never trust the
 * left entry on a stack that passes the header through untouched, since anyone
 * can forge it.
 */
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return (
    req.headers["x-real-ip"] ||
    (req.socket && req.socket.remoteAddress) ||
    null
  );
}

function ipVersion(ip) {
  if (!ip) return null;
  return ip.includes(":") ? "IPv6" : "IPv4";
}

/**
 * ipinfo returns the operator as a single string: "AS3209 Vodafone GmbH".
 * Split it so callers get a usable ASN and a usable name separately.
 */
function splitOrg(org) {
  if (!org) return { asn: null, org: null };
  const m = String(org).match(/^(AS\d+)\s+(.*)$/);
  return m ? { asn: m[1], org: m[2] } : { asn: null, org: String(org) };
}

function splitLoc(loc) {
  if (!loc) return { latitude: null, longitude: null };
  const parts = String(loc).split(",");
  if (parts.length !== 2) return { latitude: null, longitude: null };
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lon)) return { latitude: null, longitude: null };
  return { latitude: lat, longitude: lon };
}

async function lookup(ip) {
  if (!TOKEN) return { ok: false, reason: "token_missing" };
  if (!ip) return { ok: false, reason: "no_client_ip" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(TOKEN)}`,
      { signal: ctrl.signal, headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      return { ok: false, reason: res.status === 429 ? "rate_limited" : "provider_error" };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, reason: err.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  // Open to any origin: this is a public read-only endpoint with no secrets
  // and no user state, so there is nothing for a hostile page to steal.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  // CRITICAL: never let a CDN or browser cache this. The response is specific
  // to the caller, so a shared cache would serve one visitor's address to the
  // next visitor. This single header is the difference between a privacy tool
  // and a privacy incident.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed", allow: "GET" });
  }

  const ip = clientIp(req);
  const result = await lookup(ip);

  // Deliberately not logging the address. The page promises no logs, so the
  // promise has to hold in the code as well as in the copy.
  if (!result.ok) {
    return res.status(result.reason === "rate_limited" ? 429 : 200).json({
      ip,
      version: ipVersion(ip),
      city: null,
      region: null,
      country: null,
      countryName: null,
      asn: null,
      org: null,
      timezone: null,
      latitude: null,
      longitude: null,
      postal: null,
      hostname: null,
      lookup: result.reason
    });
  }

  const d = result.data || {};
  const { asn, org } = splitOrg(d.org);
  const { latitude, longitude } = splitLoc(d.loc);

  return res.status(200).json({
    ip: d.ip || ip,
    version: ipVersion(d.ip || ip),
    city: d.city || null,
    region: d.region || null,
    country: d.country || null,
    countryName: d.country_name || null,
    asn,
    org,
    timezone: d.timezone || null,
    latitude,
    longitude,
    postal: d.postal || null,
    hostname: d.hostname || null,
    lookup: "ok"
  });
}
