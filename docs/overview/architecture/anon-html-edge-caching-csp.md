# Anonymous HTML edge caching vs. CSP nonces

Anonymous SSR HTML is cacheable at the edge (Cloudflare Workers Cache, GA) despite Voucha's
strict per-request CSP nonce. This doc records why that's safe, what the mitigation actually
does, and the honest limits of the safety argument — it is written to be audit-facing, not just
an internal design note.

## Problem

Anonymous SSR HTML was not edge-cached before this migration. The blocking reason was the CSP
nonce: [`csp.mts`](../../../cloudflare-worker/src/csp.mts)'s `buildWebCsp` mints a fresh
per-request `nonce-<uuid>` and the response `Content-Security-Policy` header must agree with
every inline `<script nonce>` in the body. A cache entry shared across visitors freezes one
visitor's nonce into the body — serving it to everyone means either the CSP header disagrees
with the body (every inline script blocked, page broken) or CSP has to be relaxed.

## Options considered

| Option                                                      | What it does                                                                                                                                                                                                                                                                                         | Verdict                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Placeholder-nonce + edge rewrite (CHOSEN)**            | Origin stamps a fixed, high-entropy, per-deploy secret placeholder nonce into the body + CSP; the body caches; the gateway streams a chunk-boundary-safe replacement of the placeholder → a fresh per-request nonce on every serve, and independently rebuilds the CSP header with that fresh nonce. | Keeps a strict per-request nonce; single CSP enforcement point stays in the gateway. Fail-closed on script execution; placeholder secrecy is load-bearing (below).                                                    |
| B. `unsafe-inline` (or drop the nonce) on anon pages        | Relax `script-src` to `'unsafe-inline'` for the cacheable anon surface.                                                                                                                                                                                                                              | Rejected. Makes the HTML sanitizer the sole defense on the public surface search engines and scanners hit — loses defense-in-depth permanently, not just on a disclosure.                                             |
| C. Hash-based CSP / `experimental.sri` / `'strict-dynamic'` | Pin inline scripts by CSP hash, hash external bundles, or trust root scripts transitively — avoid a per-request nonce entirely.                                                                                                                                                                      | **Deferred — viable but not adopted now.** The earlier "same per-serve cost" reasoning was imprecise; see [§ Option C revisited](#option-c-revisited-hash-based-csp) for the corrected analysis and revisit triggers. |
| D. Defer anon HTML caching                                  | Keep the previous bypass.                                                                                                                                                                                                                                                                            | Rejected — anon HTML caching is a hard requirement for this migration.                                                                                                                                                |

## Invariance audit: what actually varies per-request in anon HTML

Anonymous personalization in this app is `localStorage`-only — see
[caching-strategy.md § Client-Side Personalization](./caching-strategy.md#client-side-personalization).
The cache key is URL + `ctx.props` only (audience/RSC/UI-locale — see below), never cookies. Every
per-request/per-visitor value in the anon SSR body was inventoried:

- **No CSRF/anti-forgery tokens** — Voucha uses none by design (SameSite + origin guard +
  JSON-only; see [`docs/requirements/security/CSRF.md`](../../requirements/security/CSRF.md)).
- **No session identity in the body** — session state travels via `Set-Cookie` only, applied on
  the gateway's out-path, never on the cacheable `CachedOrigin` response (see
  [`cached-origin.mts`](../../../cloudflare-worker/src/cached-origin.mts), which always mints a
  fixed `{ kind: 'anon-passthrough' }` edge session — no session cookie ever reaches origin or
  gets baked into cached bytes). Anon renders with `currentUser={null}`.
- **No geo/IP/country personalization** — no web render path reads `cf-ipcountry` or similar geo
  signals.
- **Feature flags** — SSR renders a stable empty sentinel; flags apply client-side
  post-hydration. Depends on `stripAllCookies: true` staying on for the anon audience so the `ff`
  cookie never reaches origin on a cacheable request — enforced today by
  [`cache-policy.mts`](../../../cloudflare-worker/src/cache-policy.mts)'s `getCachePolicy`,
  which sets `stripAllCookies: true` unconditionally for every cacheable audience (`static`,
  `bot`, `anon`).
- **Per-request values that DO exist:**
  1. The CSP nonce (see Decision below).
  2. The anon-session `Set-Cookie` — moved to the gateway out-path
     ([`session-cookies.mts`](../../../cloudflare-worker/src/auth/session-cookies.mts)'s
     `withEdgeSessionCookies`); `CachedOrigin` never emits `Set-Cookie`.
  3. Sentry trace meta (`<meta name="sentry-trace">` / `<meta name="baggage">`) — low severity (a
     trace-correlation id, no PII), but genuinely per-request. Because on a platform HIT the origin
     never ran, a trace id frozen from a stale MISS would misattribute the trace, so it's
     suppressed at Next.js render time on a `CachedOrigin` fill instead of ever being emitted (see
     Decision below). The gateway also keeps a defense-in-depth strip of the same tags as a
     deploy-overlap safety net (below), since the two deployables ship independently.

**Conclusion:** there is no per-visitor personalized/private data in anon HTML. The one
structural blocker is the CSP nonce, with the mitigation below.

## Decision: placeholder-nonce + edge rewrite

`CachedOrigin` ([`cached-origin.mts`](../../../cloudflare-worker/src/cached-origin.mts)) stamps
every cacheable web HTML response with a fixed placeholder nonce
(`env.CACHE_PLACEHOLDER_NONCE`) instead of a real one — both in the body's `nonce="…"`
attributes and in the `Content-Security-Policy` header it emits, via
[`csp.mts`](../../../cloudflare-worker/src/csp.mts)'s `buildWebCsp`. The _same_ cached bytes are
therefore valid for every client that later gets served that entry.

On the way out, the gateway ([`nonce-rewrite.mts`](../../../cloudflare-worker/src/nonce-rewrite.mts)'s
`rewritePlaceholderNonce`) rewrites the placeholder back to a fresh, real per-request nonce:

- The response body streams through a chunk-boundary-safe nonce matcher. It retains only the
  partial candidate needed to decide whether the next bytes complete the placeholder, so an
  unrewritten placeholder never reaches a client while the Worker does not retain the HTML body.
- Sentry trace meta is primarily kept out of the cached bytes at render time, not by rewriting
  them back out: [`origin-request.mts`](../../../cloudflare-worker/src/origin-request.mts) tags
  every web `CachedOrigin` fill's origin request with `x-voucha-request-kind: cache-fill`
  (request→origin only, never a response header, so it can't leak into cached bytes itself), and
  [`web/app/layout.tsx`](../../../web/app/layout.tsx)'s `generateMetadata` reads that header to
  omit `Sentry.getTraceData()` on that one render — every other render (bypass, authenticated, RSC)
  still emits it.
- The same rewrite pass also strips any `sentry-trace`/`baggage` meta tags that still make it into
  the body (`SENTRY_META_TAG_RE` in `nonce-rewrite.mts`). This is deploy-overlap defense in depth,
  not the primary mechanism: `cloudflare-worker` and `web` deploy independently (see
  [deploy decoupling](../infrastructure/deployment.md#deploy-decoupling--independent-safety)), so
  there's a window where the gateway has shipped this strip but `web` hasn't yet shipped the
  render-time suppression — old `web` still emits the tags unconditionally in that window, and this
  strip is what keeps them out of shared cache bytes until `web` catches up. Remove it in a
  fast-follow once both are confirmed live with the render-time suppression.
- The response `Content-Security-Policy` header is **not** touched by this function at all: the
  gateway's `addSecurityHeaders()` call (in
  [`index.mts`](../../../cloudflare-worker/src/index.mts)) unconditionally rebuilds that header
  fresh, with the real per-request nonce, on every response regardless of dispatch path — so by
  the time a client sees it, the header is already correct independent of whether the body
  rewrite succeeded.

`CachedOrigin` parses the `Content-Type` media type exactly and case-insensitively (for example,
`Text/HTML; Charset=UTF-8` is HTML, while `text/htmlx` is not). A successful, extensionless
web-document response with a missing or non-HTML media type is rejected as a standardized no-store
`502` before cacheable headers are emitted, so Workers Cache cannot store it. The dispatch boundary
repeats the check as defense in depth before the body can reach the client. Known static-asset
extensions remain byte-preserving, and redirects remain untouched. This prevents an origin
metadata mistake from bypassing the nonce rewrite and disclosing the placeholder.

### Safety properties: fail-closed on execution, fail-open on placeholder secrecy

Two distinct properties, stated plainly rather than as a blanket "can't be exploited" claim:

**Fail-closed for script execution.** Because `addSecurityHeaders()` always regenerates the CSP
header with the real nonce independent of the body rewrite, the response CSP header can never
carry the placeholder. If a body rewrite somehow missed (it shouldn't, given the buffer-first
design above), legitimate inline scripts would keep the placeholder nonce while the CSP header
carries the real nonce — those scripts get **blocked**, not silently allowed. A miss degrades
the page; it does not open an XSS via the miss itself.

**Fail-open for placeholder secrecy — the placeholder must stay secret.** A missed rewrite would
also leak the placeholder to the client (it would ship un-rewritten in the body). Because the
gateway promotes `nonce="<placeholder>"` → `nonce="<real>"` on the way out, an attacker who knows
the placeholder value could inject `<script nonce="<placeholder>">` that the rewrite then
"legitimizes" into a valid `nonce="<real>"` — defeating the nonce entirely. So **the
placeholder's secrecy is load-bearing**: while it's secret, the strict nonce + defense-in-depth
holds; a disclosure degrades the nonce layer to "sanitizer-only" (the posture Option B was
rejected for) until the placeholder rotates. **Treat a placeholder disclosure as a security
incident.**

**Why Option A still wins over B:** B is _permanently_ sanitizer-only on the public surface. A
degrades _only on disclosure_ and is _recoverable by rotation_ — see below.

### Placeholder rotation

`CACHE_PLACEHOLDER_NONCE` is a Cloudflare Worker secret provisioned by the private deployment
receiver and **regenerated every deploy**, not pinned to one static value. Rotating it bounds any disclosure
to a single deploy window. Rotation also invalidates the placeholder baked into already-cached
anon HTML from before the rotation — see
[`caching-strategy.md`](./caching-strategy.md#cache-invalidation) for how that interacts with the
Cache-Tag purge path and the (not-yet-shipped) TTL raise.

## What's not (yet) covered: RSC navigation

React Server Component fetches (`?_rsc=1` / `accept: text/x-component`) are **excluded from edge
dispatch entirely** today — see `request-handler.mts`'s `canDispatchToCache`, which requires
`!isRsc`. Anon RSC responses stay on the bypass path (per-request origin fetch, today's
non-cached nonce forwarding), while anon HTML _documents_ are cacheable. `ctx.props.isRsc`
already exists as a cache-key partition dimension so RSC dispatch is a pure gate flip once
enabled — see [`cache-dispatch.mts`](../../../cloudflare-worker/src/cache-dispatch.mts) — but it
is intentionally not turned on yet, pending staging verification that a cached document's nonce
(N1) can stay consistent with scripts a client-side RSC navigation injects afterward (which would
need to satisfy that same N1). Enabling RSC dispatch without resolving that is out of scope for
this migration.

## Option C revisited: hash-based CSP

Issue [#8391](https://github.com/jonathanong/filaments/issues/8391) asked whether the per-request
placeholder-nonce rewrite — which runs on every cached HTML serve, including platform-cache HITs —
can be eliminated by adopting hash-based CSP. This section corrects the original Option C reasoning
and records why it's deferred rather than adopted.

**The "same per-serve cost" reasoning was imprecise.** Per-page inline-script hashes are derived
from the exact bytes being cached, so they can be computed **once at cache-fill (MISS)** and stored
alongside the cache entry — per-serve cost would be **zero**, not "the same as the rewrite." It
would in fact remove the whole-body buffer-and-replace pass entirely. Determinism across renders
isn't required, because the hash is taken from the exact bytes that get cached.

But that per-serve saving is only reachable by **caching the per-page hash set**, which moves
per-page CSP state into the cache and relaxes the invariant Option A was chosen to keep — "single
CSP enforcement point stays in the gateway," where the `addSecurityHeaders()` call
([`index.mts`](../../../cloudflare-worker/src/index.mts)) unconditionally rebuilds the
`Content-Security-Policy` header fresh on every response. Under that invariant, "same per-serve
cost" is true: the original verdict priced Option C without relaxing it. The accurate framing is
**per-serve cost is avoidable, but only by moving per-page CSP state into the cache — which is
exactly the "more moving parts" the verdict also cited.**

Two more corrections to the original reasoning:

- **The nonce exists only to authorize inline scripts.** Today's CSP has no `'strict-dynamic'`
  (see [`csp.mts`](../../../cloudflare-worker/src/csp.mts)'s `script-src`), so external bundles are
  already authorized by `'self'` plus the asset-origin host-source, nonce or not. The placeholder
  rewrite exists purely to authorize the inline bootstrap and `self.__next_f` flight scripts
  (emitted via `dangerouslySetInnerHTML`) — exactly the set CSP hashes cover. SRI
  (`experimental.sri`) is a red herring here regardless of bundler: per the
  [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy#subresource-integrity-experimental),
  it only hashes external `<script src>` bundles at build time, so it can't cover inline scripts no
  matter how they're built. `strict-dynamic` remains correctly rejected — it doesn't trust
  parser-inserted sibling inline scripts.
- **The rewrite does two jobs, not one.**
  [`rewritePlaceholderNonce`](../../../cloudflare-worker/src/nonce-rewrite.mts) also strips
  `sentry-trace`/`baggage` meta tags. Eliminating the rewrite means both jobs need a new home; the
  Sentry-meta strip already has one — render-time suppression, with the Worker-side strip itself
  tracked for removal once both sides are confirmed live (see
  [caching-strategy.md](./caching-strategy.md#cache-invalidation) and the deploy-overlap note above).

**Why it's deferred, not adopted, even with the corrected cost analysis:**

1. **Feasibility is unproven.** There's no known demonstration of hash-based CSP over Next's inline
   flight scripts in a cached-edge setup, and Next's own inline-script CSP story is still actively
   changing.
2. **New machinery at cache-fill.** Adopting it needs byte-exact extraction and SHA-256 hashing of
   every inline `dangerouslySetInnerHTML` script via an HTML tokenizer at MISS time, plus caching
   and retrieving the resulting per-page hash set.
3. **Two CSP shapes to maintain.** Cached HTML would need hash-based CSP while the bypass,
   authenticated, and RSC paths keep nonce-based CSP — `addSecurityHeaders()` would need to
   special-case cached HTML instead of unconditionally rebuilding one CSP shape for every response.
4. **The failure mode flips from recoverable to brittle.** Today a missed rewrite fails open on
   placeholder secrecy but is recomputed on every serve, so a fix (rotation) takes effect
   immediately. A missed hash extraction would instead bake a broken page into the cache until the
   next purge — fail-closed, but silently and per-URL, with no equivalent of rotation to recover it
   short of a purge.

The upside is real and durable: adopting Option C would remove the fail-open-on-placeholder-secrecy
risk class entirely, along with the `CACHE_PLACEHOLDER_NONCE` secret and its rotation burden. That's
why this stays a deferred option rather than a permanent rejection.

**Revisit when:**

- The per-serve rewrite CPU is shown by profiling to be a genuine hot-path bottleneck. The closed
  CPU-reduction issue [#8392](https://github.com/jonathanong/filaments/issues/8392) explicitly
  assumed the nonce swap "cannot move out of the Worker" — but that assumption is a property of
  Option A's architecture, not a law; under Option C the equivalent work moves to cache-fill time
  instead of running on every serve.
- Next.js ships first-class inline-script hash emission, or otherwise stabilizes its inline-script
  CSP story for cached/edge-served pages.
- Managing `CACHE_PLACEHOLDER_NONCE`'s secrecy and rotation becomes an operational burden significant
  enough to justify the migration cost on its own.

## Related

- [Caching strategy](./caching-strategy.md) — cache tiers, TTLs, `Cache-Tag` purge, what's cached today
- [`cloudflare-worker/CLAUDE.md`](../../../cloudflare-worker/CLAUDE.md) — placeholder-nonce operational rule
- [Security requirements](../../requirements/security/SECURITY.md)
- [CSRF](../../requirements/security/CSRF.md) — why Voucha has no anti-forgery tokens to worry about here
