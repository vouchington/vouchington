# Next.js CVE Tracking reference

[Back to Next.js CVE Tracking](SECURITY-NEXTJS-CVES.md)

## Edge Mitigation Reference

The Cloudflare Worker strips the following Next.js-internal request headers in
[`cloudflare-worker/src/proxy.mts`](../../../cloudflare-worker/src/proxy.mts) inside
`buildOriginRequest`:

| Header                       | CVE(s) it blocks                               |
| ---------------------------- | ---------------------------------------------- |
| `x-middleware-subrequest`    | CVE-2025-29927 (auth bypass)                   |
| `x-middleware-subrequest-id` | CVE-2025-30218 (data leak)                     |
| `x-nextjs-data`              | GHSA-3g8h-86w9-wvmq (redirect cache poisoning) |
| `x-now-route-matches`        | CVE-2025-32421 (Pages Router pageProps leak)   |
| `next-resume`                | CVE-2026-44579 (DoS)                           |
| `next-action-nonce`          | Defense-in-depth around CVE-2026-44581         |

The `rsc` header is intentionally NOT stripped — Next.js requires it for RSC
navigation. CVE-2025-49005 / CVE-2026-44576 / CVE-2026-44582 (RSC cache poisoning)
are mitigated structurally by appending a `__rsc=1` marker to the cache key in
[`cloudflare-worker/src/cache-policy.mts`](../../../cloudflare-worker/src/cache-policy.mts),
so HTML and RSC payloads for the same URL cannot collide regardless of header
value.

`next-action` is intentionally **not** stripped — Server Actions rely on it for
origin validation. The worker uses it to classify the request for the
`RATE_LIMITER_SERVER_ACTION` bucket only for web-target POSTs. API callers cannot
self-classify by adding the header.

### RSC cache key separation

[`cloudflare-worker/src/cache-policy.mts`](../../../cloudflare-worker/src/cache-policy.mts)'s
`buildCacheKey` appends `__rsc=1` to the cache key when the request shape
indicates RSC (presence of `_rsc=` query param or `Accept: text/x-component`).
This guarantees HTML and RSC payloads for the same URL never share a cache
entry, blocking the `_rsc=` birthday-collision vector described in CVE-2026-44582.

### Server Action rate-limit bucket

[`cloudflare-worker/src/identity-rate-limit.mts`](../../../cloudflare-worker/src/identity-rate-limit.mts)
requires web-target POSTs carrying a `next-action` header to pass the generic
mutating bucket and then the stricter `RATE_LIMITER_SERVER_ACTION` subset
bucket. All mutating verbs share the generic `MUTATING` key, preventing
method rotation from multiplying quota. This contains blast radius of any future RSC
deserialize-DoS or RCE class bug (CVE-2025-55184, CVE-2025-67779,
CVE-2025-66478 react2shell).

## Process

When bumping `next`:

1. Check the [Next.js security advisories index](https://github.com/vercel/next.js/security/advisories)
   and this repository's GitHub Dependabot security alerts for any new CVEs since the previous
   bump.
2. Add a row to the per-CVE table for each new advisory.
3. If a new advisory exposes an internal Next.js header that external clients
   should never send, add it to the strip list in
   [`cloudflare-worker/src/proxy.mts`](../../../cloudflare-worker/src/proxy.mts) with
   a one-line CVE citation in the existing block comment.
4. Add a test in
   [`cloudflare-worker/src/__tests__/proxy.test.mts`](../../../cloudflare-worker/src/__tests__/proxy.test.mts)
   asserting the new header is stripped on the origin request.

## See Also

- [SECURITY.md](./SECURITY.md) — overall security architecture
- [`cloudflare-worker/src/proxy.mts`](../../../cloudflare-worker/src/proxy.mts) — header strip list
- [`cloudflare-worker/CLAUDE.md`](../../../cloudflare-worker/CLAUDE.md) — worker rules
