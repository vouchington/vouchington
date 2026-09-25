# Security Architecture reference

[Back to Security Architecture](SECURITY.md)

## Sentry Request-Metadata Scrubbing

Sentry telemetry (errors, spans, breadcrumbs, and the Request Interface) previously shipped full URLs,
including query strings and fragments. Unsubscribe tokens, email-verification tokens, and API keys
are transmitted as query parameters across this codebase, so those URLs leaked secrets to Sentry.
See the original analysis (formerly filed as jonathanong/filaments#8834).

Sentry also copies request headers and cookies into error Request Interfaces and segment-span attributes
without applying its span-header filtering. Repository-side scrubbing is therefore mandatory defense in
depth; hosted Sentry Data Scrubbing settings are not known from this repository.

### Shared scrubbing utility

[`ts-shared/utils/observability-scrubbing.mts`](../../../ts-shared/utils/observability-scrubbing.mts)
owns URL stripping, while
[`ts-shared/utils/sentry-event-scrubbing.mts`](../../../ts-shared/utils/sentry-event-scrubbing.mts)
owns credential redaction, event composition, and the dependency-free `beforeSend` composer:

Both modules delegate generic URL, header, and span transformations to
`@vouchington/utils/observability`. Vouchington retains its Voucha-specific key and credential
policy, plus a copy-on-write adapter: a safe event, request, breadcrumb, header object, or span
attributes record is returned by reference; only a changed branch is rebuilt. The upstream helpers
include a header helper that intentionally returns a fresh record, so calling that helper directly
would violate this Sentry hook contract.

- **Stripped in place** (query string/fragment removed, rest of the URL kept): `url`, `url.full`,
  `http.url`, `http.target`, `http.request.header.referer`, `http.request.header.referrer`
- **Deleted entirely** (the key only ever carries the query string or fragment, never a usable
  value once stripped): `url.query`, `http.query`, `url.fragment`, `http.fragment`
- **Credential headers replaced with `[Filtered]`**, matched case-insensitively in
  `event.request.headers`: `authorization`, `proxy-authorization`, `x-api-key`,
  `cf-access-jwt-assertion`, `x-cf-worker-secret`, `x-bedrock-batch-shared-key`,
  `x-voucha-cache-purge-secret`, `x-app-attest-assertion`, `x-app-attest-nonce`,
  `x-app-attest-challenge-id`, `stripe-signature`, `signature`, and `cookie`
- **Request cookies replaced with `[Filtered]`** while preserving cookie names in
  `event.request.cookies`
- **Credential span attributes replaced with `[Filtered]`** after Sentry's hyphen-to-underscore
  normalization, including every `http.request.header.cookie` and
  `http.request.header.cookie.*` value

Eight of these ten keys mirror the attribute set documented by `@sentry/conventions`, hardcoded here
rather than taken as a dependency. Generic mechanics delegate to
`@vouchington/utils/observability`; the Sentry-specific key boundary stays hardcoded here.
The two `http.request.header.*` keys have different provenance — see
[URL-bearing request headers](#url-bearing-request-headers) below.

### Hook wiring, per workspace

Every workspace wires both SDK v11 hooks. Sentry v11 defaults to span streaming
(`traceLifecycle: 'stream'`): there is no transaction event, so `beforeSendTransaction` never runs
and is not registered. `beforeSendSpan` receives every span — segment and child alike — as a
`StreamedSpanJSON` whose `attributes` record carries the URL, header, and cookie keys listed above
(the request rides on the segment span's attributes rather than on `event.request`); `beforeSend`
covers errors. Existing filters or Lambda-specific hooks run first; their final non-null result is
scrubbed. Null drops, synchronous returns, async returns, thrown errors, and rejected promises keep
their existing control flow.

| Workspace         | File                                                                  | Notes                                                                                                                            |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Backend           | `backend/modules/on-error/sentry-scrub.mts` (wired from `sentry.mts`) | `scrubSentrySpan`, overridable via `SentryInitDeps`                                                                              |
| Web (server)      | `web/sentry-server-options.ts`                                        | DI pattern via `SentryServerInitDeps`; `web/sentry.server.config.ts` initializes these options                                   |
| Web (client)      | `web/sentry.client.config.ts`                                         | Inline `Sentry.init()`; the only surface where the plain `url` and `*.fragment` keys are actually observed (browser fetch spans) |
| Web (edge)        | `web/sentry.edge.config.ts`                                           | Inline `Sentry.init()`, same hooks                                                                                               |
| Lambdas           | `lambdas/shared/sentry.mts`                                           | Retains the existing deep event scrubber, then applies the shared request-metadata contract                                      |
| Cloudflare Worker | `cloudflare-worker/src/sentry.mts`                                    | Registers the shared error and span scrubbers                                                                                    |

Enabled Sentry reporting surfaces always register the scrubbers. Sentry is disabled outside
`staging`/`production`, including under `OTEL_ENABLED=1`. These hooks do not establish a scrubbing
contract for the independent OTLP export path (`dev/otel-register.mts`), which carries no Sentry
payload and is outside the scope of this change.

### URL-bearing request headers

An HTTP header value can itself be a full URL with a query string — most notably `Referer`, which
carries whatever page the user navigated from, tokens and all (e.g. an unsubscribe link's `?token=`).
A prior investigation (formerly filed as jonathanong/filaments#8866) found that the original eight-key
enumeration missed this: the header value reaches Sentry through two fields that
`scrubSpanUrlAttributes`/`scrubRequestUrlFields` already had in hand, but neither scrubbed it.

1. **`event.request.headers.referer`** — the Sentry Request Interface's headers, copied through by
   `scrubRequestUrlFields`.
2. **The `http.request.header.referer` span attribute** — constructed at runtime by `@sentry/core`'s
   `httpHeadersToSpanAttributes` (`utils/request.js`), which emits `http.request.header.<name>` for
   every request header that survives Sentry's PII deny list. `referer` survives that list: it
   matches neither `PII_HEADER_SNIPPETS` nor `SENSITIVE_KEY_SNIPPETS`
   (`utils/data-collection/filtering-snippets.js`), even though its value is itself a URL.

Both fields carry the same URL, so the util scrubs both — `http.request.header.referer` joins the
"stripped in place" attribute keys, and `scrubRequestUrlFields` gained a header-scanning pass that
rebuilds the `headers` object only when a URL-bearing header actually needs stripping (so requests
without one still return by reference — the wrappers depend on that for their own no-op
short-circuit).

The header-name list also covers `referrer` (the JS/Fetch-API spelling) in case a header is
hand-rolled that way, matched case-insensitively since the browser SDK emits `Referer` and Node
emits `referer`. `Origin` is deliberately **not** included — it is scheme+host+port only, never a
path or query string, so it carries no secret to strip.

Sentry can represent a repeated header as an array. The adapter strips every string member of a
`referer` or `referrer` array while preserving non-string members and never mutating the original
array.

URL-bearing-header stripping and credential redaction remain separate pure helpers so their
contracts and no-op identity guarantees stay independently testable. The combined event scrubber
applies both without allowing either transformation to overwrite the other.

### Explicit boundary

The shared contract covers request metadata only: request and breadcrumb URLs, query strings,
credential request headers, Request Interface cookies, and corresponding span attributes. It does
not inspect request bodies, arbitrary `extra` values, arbitrary contexts, attachments, replays, or
logs. Lambda events retain their pre-existing broader deep scrubber. Reading Sentry v10's
`requestdata.js` and `utils/request.js` confirmed that its other request-header producers use the
same normalized `http.request.header.*` and cookie-key shapes covered here.

The `http.request.body.data` span attribute that Sentry v11 emits on segment spans is likewise
outside the contract, and that is parity rather than a regression: v10's `requestdata.js` defaulted
`include.data` to `true` and copied the normalized request body into `event.request.data` on
transaction events (and onto the same `http.request.body.data` span attribute), and nothing in this
repository scrubbed it there either.

### Verification

The fixture matrices in
[`observability-scrubbing.test.mts`](../../../ts-shared/utils/observability-scrubbing.test.mts) and
[`sentry-event-scrubbing.test.mts`](../../../ts-shared/utils/sentry-event-scrubbing.test.mts) test
the URL, credential-header, cookie, and composition contracts — including that the four
component-only keys are **deleted** entirely rather
than overwritten with an empty string, and that the two `http.request.header.*` keys and their
request-header counterparts strip in place while non-URL-bearing headers and non-string header values
pass through byte-identical — plus non-mutation and reference-identity guarantees on the input
object, including multi-value `referer` headers. Backend, Lambda, Cloudflare Worker, and web hook
tests each characterize the same request-header result through their runtime wrapper. It tests the
utility functions directly; it does not invoke the Sentry SDK, so it cannot prove that the SDK
actually populates `request.headers.referer`/`http.request.header.referer` in the first place, nor
that a `delete` inside `beforeSendSpan`'s return value reaches the transmitted span (streamed spans
use the returned `StreamedSpanJSON` directly, with no merge step). Those SDK-behavior claims were
verified by reading `@sentry/core`, `@sentry/browser`, and `@sentry/cloudflare` source (v10.68.0 for
the header producers, v11.0.0 for the streamed span path), not by a test in this repo.
The tests also freeze inputs and verify copy-on-write identity for changed and unchanged objects,
plus sync, async, and null hook composition. Each workspace additionally has its own hook-wiring test alongside its
`sentry.mts`/`sentry-server-options.ts` equivalent, asserting the hooks are registered — none of them
exercise SDK-internal merge behavior either.

## Related

- [Error handling architecture](../../overview/architecture/error-handling.md)
- [Client-side onError](../../../web/lib/on-error/README.md)
- [Backend onError](../../../backend/modules/on-error/README.md)
