/**
 * GET /api/ip  —  Cloudflare Pages Function
 *
 * Returns the caller's IP address and network details as flat JSON.
 *
 * Cloudflare attaches geolocation to every incoming request, so this needs no
 * third-party lookup service, no API key and no rate limit of its own. That
 * removes a dependency, removes a party that used to receive every visitor's
 * address, and removes the failure mode where a free tier ran out mid-month.
 *
 * The previous host resolved this data by calling an external provider from
 * the server; here it arrives with the request.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  // CRITICAL: never cache. The response is specific to the caller, so a shared
  // cache would serve one visitor's address to the next visitor. This single
  // header is the difference between a privacy tool and a privacy incident.
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer"
};

/** Turn an ISO country code into a readable name, without shipping a table. */
function countryName(code) {
  if (!code) return null;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code) || null;
  } catch (e) {
    return null;
  }
}

function ipVersion(ip) {
  if (!ip) return null;
  return ip.includes(":") ? "IPv6" : "IPv4";
}

function num(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && isFinite(n) ? n : null;
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed", allow: "GET" }), {
      status: 405,
      headers: JSON_HEADERS
    });
  }

  // CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the
  // client, unlike x-forwarded-for on a stack that passes it through.
  const ip = request.headers.get("CF-Connecting-IP") || null;

  // Absent when running locally without the edge; report honestly rather than
  // inventing values.
  const cf = request.cf || null;

  // Deliberately not logging the address. The site promises no logs, so the
  // promise has to hold in the code as well as in the copy.
  const body = {
    ip,
    version: ipVersion(ip),
    city: (cf && cf.city) || null,
    region: (cf && cf.region) || null,
    country: (cf && cf.country) || null,
    countryName: countryName(cf && cf.country),
    asn: cf && cf.asn ? "AS" + cf.asn : null,
    org: (cf && cf.asOrganization) || null,
    timezone: (cf && cf.timezone) || null,
    latitude: num(cf && cf.latitude),
    longitude: num(cf && cf.longitude),
    postal: (cf && cf.postalCode) || null,
    hostname: null,
    lookup: cf ? "ok" : "no_edge_data"
  };

  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}
