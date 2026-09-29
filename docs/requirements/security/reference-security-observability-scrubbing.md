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
  `x-app-attest-challenge-id`, `stripe-signature`, `signature`, `copyright-guest-capability`,
  `idempotency-key`, and `cookie`
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

| Workspace         | File                                                                  | Notes                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend           | `backend/modules/on-error/sentry-scrub.mts` (wired from `sentry.mts`) | `scrubSentrySpan`, overridable via `SentryInitDeps`                                                                                                               |
| Web (server)      | `web/sentry-server-options.ts`                                        | DI pattern via `SentryServerInitDeps`; `web/sentry.server.config.ts` initializes these options                                                                    |
| Web (client)      | `web/sentry-client-options.ts`                                        | `web/sentry.client.config.ts` initializes these options; the only surface where the plain `url` and `*.fragment` keys are actually observed (browser fetch spans) |
| Web (edge)        | `web/sentry-edge-options.ts`                                          | `web/sentry.edge.config.ts` initializes these options, same hooks                                                                                                 |
| Lambdas           | `lambdas/shared/sentry.mts`                                           | Retains the existing deep event scrubber, then applies the shared request-metadata contract                                                                       |
| Cloudflare Worker | `cloudflare-worker/src/sentry.mts`                                    | Registers the shared error and span scrubbers                                                                                                                     |

Enabled Sentry reporting surfaces always register the scrubbers. Sentry is disabled outside
`staging`/`production`, including under `OTEL_ENABLED=1`. These hooks do not establish a scrubbing
contract for the independent OTLP export path (`dev/otel-register.mts`), which carries no Sentry
payload and is outside the scope of this change.

### Data collection: bodies and gen-AI content

Sentry v11 collects by default what `@sentry/core`'s `resolveDataCollectionOptions` resolves:
every HTTP body (`httpBodies`: incoming and outgoing requests and responses) and every gen-AI
input and output (`genAI: { inputs: true, outputs: true }`). Request bodies carry copyright
notice and counter-notice fields (legal identities, addresses, perjury statements) and other form
data. Gen-AI inputs carry the same content as LLM prompts, plus MCP tool arguments and results.

[`ts-shared/utils/sentry-data-collection.mts`](../../../ts-shared/utils/sentry-data-collection.mts)
owns the policy, and every SDK init site passes it as `dataCollection`:

```ts
{ httpBodies: [], genAI: { inputs: false, outputs: false } }
```

- An empty `httpBodies` array turns off request and response body capture.
- `genAI.inputs`/`genAI.outputs` are the fallback for the AI integrations (OpenAI, Anthropic and
  the rest of `ai/core`, plus Vercel AI) and the MCP server integration. Each uses `genAI` unless
  an integration's `recordInputs`/`recordOutputs` option or, for Vercel AI, a per-call
  `experimental_telemetry` flag overrides it. The repository sets neither, so the policy applies
  to all of them.
- Headers, cookies, query strings and user info stay collected and pass through the credential
  scrubbers above.

The init sites are `backend/modules/on-error/sentry.mts` (shared by the API server and every
worker entrypoint), `web/sentry-server-options.ts`, `web/sentry-edge-options.ts`,
`web/sentry-client-options.ts`, `lambdas/shared/sentry.mts` and `cloudflare-worker/src/sentry.mts`.
Each site's options test asserts the policy, typed against the SDK's `dataCollection` option so a
misspelled key fails type-checking. If a Lambda is deployed with the
`--import @sentry/aws-serverless/awslambda-auto` preload, that preload calls `init()` with default
options, but `initSentry()` replaces the client at module load, before any invocation. Every body
and gen-AI gate reads the current client (`getClient()`) per request, so the policy applies.

`httpBodies` gates only the SDK's own body capture (`integrations/http/server-subscription.js` in
`@sentry/core`, `integrations/httpServer.js` in `@sentry/cloudflare`). `requestdata.js` still
copies any body data already on the scope into `event.request.data` and the
`http.request.body.data` span attribute. As a backstop, `scrubSentryEvent` drops `request.data`
and `scrubSpanAttributes` drops `http.request.body.data`.

These SDK behaviors were verified by reading `@sentry/core@11.0.0`
(`utils/data-collection/resolveDataCollectionOptions.js`, `integrations/requestdata.js`,
`integrations/http/server-subscription.js`, `integrations/mcp-server/transport.js`),
`@sentry/server-utils@11.0.0` (`ai/core/utils.js`, `integrations/index.js`,
`integrations/vercel-ai/vercel-ai-dc-subscriber.js`) and
`@sentry/cloudflare@11.0.0` (`integrations/httpServer.js`).

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

### Credential-in-path requests

Scrubbing strips query strings, not path segments, so a request whose URL path is itself the
credential must not be traced at all. The Grafana IRM heartbeat (`GRAFANA_IRM_HEARTBEAT_URL`) is the
one such request: `sendGrafanaHeartbeat` in `backend/entrypoints/worker-cpu/grafana-heartbeat.mts`
runs it inside `suppressSentryTracing` (from `@modules/on-error`) and OpenTelemetry's
`suppressTracing`. Both are required: Sentry v11 instruments `fetch` and `http` natively and honors
only its own scope-based suppression, so OpenTelemetry's context key alone does not keep `url.full`
off Sentry spans and breadcrumbs. `grafana-heartbeat-tracing.no-data.mock.test.mts` pins that the
request runs inside the Sentry suppression.

### Explicit boundary

The shared contract covers request metadata and request bodies: request and breadcrumb URLs,
query strings, credential request headers, Request Interface cookies, request bodies, and
corresponding span attributes. It does not inspect arbitrary `extra` values, arbitrary contexts,
attachments, replays, or logs. Lambda events retain their pre-existing broader deep scrubber. Reading Sentry v10's
`requestdata.js` and `utils/request.js` confirmed that its other request-header producers use the
same normalized `http.request.header.*` and cookie-key shapes covered here.

Request bodies are off at the source through `dataCollection` (see
[Data collection](#data-collection-bodies-and-gen-ai-content)). The scrubbers still drop
`event.request.data` and the `http.request.body.data` span attribute, because `requestdata.js`
copies body data that reached the scope by any other path.

### Verification

The fixture matrices in
[`observability-scrubbing.test.mts`](../../../ts-shared/utils/observability-scrubbing.test.mts) and
[`sentry-event-scrubbing.test.mts`](../../../ts-shared/utils/sentry-event-scrubbing.test.mts) test
the URL, credential-header, cookie, and composition contracts, and
[`sentry-data-collection.test.mts`](../../../ts-shared/utils/sentry-data-collection.test.mts) tests
the data-collection policy and the request-body backstops — including that the four
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
- [Client-side onError](../../overview/architecture/web/lib/on-error/README.md)
- [Backend onError](../../overview/architecture/backend/modules/on-error/README.md)
