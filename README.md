# tools

Free web tools that measure honestly and keep nothing.
No accounts, no visitor database. Test results never leave the browser.
Visits are counted with Google Analytics (G-0S7RW18933); see privacy/.

Live: https://www.freevpnchecker.com

## Layout

    index.html           the VPN checker (leak tests + speed) — site root
    about/ privacy/ terms/ contact/
    404.html             served automatically by Cloudflare Pages
    500.html             not wired up on Pages; kept for reference
    functions/api/ip.js  Pages Function: returns caller IP + geolocation
    vendor/speedtest.js  Cloudflare's open-source speed engine, vendored
    _redirects           /ip and /vpn-check -> / (301)
    _headers             security headers, vendor caching
    sitemap.xml robots.txt og-image.png logo-512.png favicon.svg

## Deploying (Cloudflare Pages)

Workers & Pages -> Create -> Pages -> Connect to Git -> this repo.

    Framework preset:   None
    Build command:      (empty)
    Output directory:   /

No environment variables are needed. Geolocation comes from `request.cf`,
which Cloudflare attaches to every request, so there is no third-party
lookup service and no API key to manage.

## How the VPN checker works

Two measurements, compared:

1. Baseline with the VPN off.
2. Check with the VPN on.

Anything unchanged between them is something the VPN is not protecting.
Five items are scored: IP address, network provider, location, the address
WebRTC hands out, and IPv6.

Leak tests run entirely in the browser. Speed uses Cloudflare's engine
against their nearest server, with result submission disabled.

## Rules this code follows

- No number on screen the tool cannot stand behind.
- Unknown is reported as unknown, never guessed.
- The speed verdict must agree with the leak verdict: if no VPN was
  detected, differences are attributed to the line, not to a tunnel.
- A reversed or ambiguous comparison is named as such, not graded.
- Measurement changes bump `METHOD` in index.html, which
  invalidates stored baselines so old and new methods are never compared.

## Verification

Speed figures were reconciled against Ookla Speedtest, fast.com and
speed.cloudflare.com. Comparison logic is covered by scenario tests for
proxies, full VPNs, no VPN, carrier address rotation, IPv6 suffix
rotation, failed lookups and reversed runs.
