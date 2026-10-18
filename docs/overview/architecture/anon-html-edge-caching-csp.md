# Anonymous HTML edge caching vs. CSP nonces

Anonymous SSR HTML is cached at the edge (Cloudflare Workers Cache) despite Voucha's strict
per-request CSP nonce. This page records why that is safe and where the safety argument stops.
The Worker owns the cache-fill and CSP policy; its published edge package supplies the generic
nonce-rewrite primitive used when cached HTML returns to a client.

## Problem

The CSP header must agree with every inline `<script nonce>` in the body. A shared cache entry
freezes one visitor's nonce into the body, so serving it to others either breaks every inline
script or forces CSP to be relaxed.

## Decision: placeholder nonce plus edge rewrite

The origin stamps a secret, per-deploy placeholder nonce into the cacheable body, so the same bytes
are valid for every client. On the way out the gateway streams a replacement of the placeholder with
a fresh per-request nonce, and rebuilds the CSP header independently with that nonce. One CSP
enforcement point stays in the gateway.

Rejected alternatives:

- **`unsafe-inline` on anonymous pages.** Makes the HTML sanitizer the only defense on the public
  surface that search engines and scanners hit, permanently.
- **Not caching anonymous HTML.** Caching it is a hard requirement.
- **Hash-based CSP, `strict-dynamic` or SRI.** Deferred, see below.

## Why the cache key can ignore the visitor

Anonymous personalization is `localStorage`-only and the cache key is the URL plus audience, RSC and
locale, never cookies. The anonymous body carries no CSRF token (Voucha uses none by design), no
session identity (session cookies are applied on the gateway's out-path, never on the cacheable
response), no geo or IP personalization, and a stable empty feature-flag sentinel that depends on
cookies being stripped for cacheable audiences. The one per-request value that must be handled is
the nonce. Sentry trace meta is kept out of cache fills at render time; the gateway's strip is only
a deploy-overlap safety net, because the Worker and web deploy independently.

## Safety properties

- **Fail-closed for script execution.** The CSP header is always rebuilt with the real nonce, so if
  a body rewrite missed, inline scripts carry the placeholder, mismatch the header and are blocked.
  A miss degrades the page; it does not open XSS by itself.
- **Fail-open for placeholder secrecy.** A missed rewrite leaks the placeholder, and an attacker who
  knows it could inject `<script nonce="<placeholder>">` that the rewrite then promotes to a valid
  nonce. The placeholder's secrecy is therefore load-bearing, and a disclosure is a security
  incident that degrades the nonce layer to sanitizer-only until rotation.
- **Rotation bounds disclosure.** The placeholder is regenerated every deploy and held as a Worker
  secret, so a leak is limited to one deploy window. Rotation also invalidates placeholders baked
  into already-cached HTML.
- **Non-HTML responses never skip the rewrite.** A document response with a missing or non-HTML media
  type is rejected as a no-store error, so a metadata mistake cannot cache or disclose the placeholder.

## Not covered: RSC navigation

React Server Component fetches stay on the bypass path. Whether a cached document's nonce can stay
consistent with scripts a client-side RSC navigation injects later is unverified, so RSC dispatch is
a gate that has deliberately not been flipped.

## Deferred: hash-based CSP

Hashing inline scripts once at cache-fill would remove the per-serve rewrite and the placeholder
secret entirely. It is deferred because it moves per-page CSP state into the cache, needs byte-exact
tokenizing of Next's inline flight scripts, forces two CSP shapes (hash for cached HTML, nonce
elsewhere), and flips the failure mode from "recoverable by rotation" to "a broken page cached until
purged". SRI does not help because it only covers external bundles, and `strict-dynamic` does not
trust parser-inserted sibling inline scripts.

Revisit when profiling shows the per-serve rewrite is a real hot-path cost, when Next.js ships
first-class inline-script hash emission, or when placeholder rotation becomes an operational burden.

## Related

- [Caching strategy](./caching-strategy.md), including the `Cache-Tag` purge path
- [`cloudflare-worker/AGENTS.md`](../../../cloudflare-worker/AGENTS.md) for the placeholder-nonce operating rule
- [CSRF](../../requirements/security/CSRF.md) and [Security requirements](../../requirements/security/SECURITY.md)
