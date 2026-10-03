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

| Workspace         | File                                                                  | Notes                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend           | `backend/modules/on-error/sentry-scrub.mts` (wired from `sentry.mts`) | `scrubSentrySpan`, overridable via `SentryInitDeps`                                                                                                                 |
| Web (server)      | `web/sentry-server-options.ts`                                        | DI pattern via `SentryServerInitDeps`; `web/sentry.server.config.ts` initializes these options                                                                      |
| Web (client)      | `web/sentry-client-options.ts`                                        | `web/instrumentation-client.ts` initializes these options; the only surface where the plain `url` and `*.fragment` keys are actually observed (browser fetch spans) |
| Web (edge)        | `web/sentry-edge-options.ts`                                          | `web/sentry.edge.config.ts` initializes these options, same hooks                                                                                                   |
| Lambdas           | `lambdas/shared/sentry.mts`                                           | Retains the existing deep event scrubber, then applies the shared request-metadata contract                                                                         |
| Cloudflare Worker | `cloudflare-worker/src/sentry.mts`                                    | Registers the shared error and span scrubbers                                                                                                                       |

Enabled Sentry reporting surfaces always register the scrubbers. Sentry is disabled outside
`staging`/`production`, including under `OTEL_ENABLED=1`. These hooks do not establish a scrubbing
contract for the independent OTLP export path (`dev/otel-register.mts`), which carries no Sentry
payload and is outside the scope of this change.

### Data collection: the least-data policy

Sentry v11 collects by default what `@sentry/core`'s `resolveDataCollectionOptions` resolves: the
client IP, cookies, query strings, every HTTP body, bound database values, stack-frame local
variables, queue task arguments, GraphQL documents and variables, and every gen-AI input and
output. Request bodies carry copyright notice and
counter-notice fields (legal identities, addresses, perjury statements) and other form data. Gen-AI
inputs carry the same content as LLM prompts, plus MCP tool arguments and results. The product
rule is that the least data leaves the app, so the scrubbers above are defense in depth behind a
source-side policy rather than the only control.

[`ts-shared/utils/sentry-data-collection.mts`](../../../ts-shared/utils/sentry-data-collection.mts)
owns the policy, and every SDK init site passes it as `dataCollection`:

- `userInfo` is off. It stops `user.ip_address` on events and spans, the Node HTTP server span's
  `client.address` and `network.peer.address`, and the `infer_ip` ingest setting on browser span,
  log and metric envelopes. `requestdata` also strips client-IP headers from events.
- `httpHeaders.request` has a deny list of client-IP header names. It stops client-IP proxy headers
  on spans: the SDK copies raw request headers onto `http.request.header.*` attributes whatever
  `userInfo` says (see below).
- `cookies` is off. It stops the `Cookie` and `Set-Cookie` headers, parsed cookies and their span
  attributes.
- `urlQueryParams` is off. It stops query strings on collected URLs and the `url.query` attribute.
- `httpBodies` is empty. It stops request and response body capture.
- `databaseQueryData` is off. It stops bound query parameters, write payloads and returned rows
  (see below).
- `stackFrameVariables` is off. It stops local variable values in stack frames (see below).
- `queues` is off. It stops the arguments passed to queue tasks (see below).
- `graphQL.document` and `graphQL.variables` are off. They stop GraphQL operation documents and
  variables (see below).
- `genAI.inputs` and `genAI.outputs` are off. They stop prompts, completions and MCP tool
  arguments and results.

The deny list is the SDK's own client-IP header list (`vendor/getIpAddress.js` in `@sentry/core`)
plus Cloudflare's `cf-pseudo-ipv4`; the SDK matches deny terms by substring, so it also drops
`x-forwarded-proto` and `x-forwarded-host`. Without it the client IP would still reach spans:
`httpServerSpansIntegration` in `@sentry/node` and `wrapRequestHandlerWithInit` in
`@sentry/cloudflare` pass raw request headers to `httpHeadersToSpanAttributes`, which filters only
credential-like names. `userInfo: false` alone does not touch that path.

Left at the SDK default because they carry no user data: `httpHeaders.response` (response headers
carry no client IP, and `Set-Cookie` is covered by `cookies`) and `frameContextLines` (source
lines, not request data).

- `genAI.inputs`/`genAI.outputs` are the fallback for the AI integrations (OpenAI, Anthropic and
  the rest of `ai/core`, plus Vercel AI) and the MCP server integration. Each uses `genAI` unless
  an integration's `recordInputs`/`recordOutputs` option or, for Vercel AI, a per-call
  `experimental_telemetry` flag overrides it. The repository sets neither, so the policy applies
  to all of them.
- `databaseQueryData` is read only by the Supabase integration (`integrations/supabase.js` in
  `@sentry/core`), which the repository does not register. The Postgres instrumentation in
  `@sentry/server-utils` attaches the sanitized `db.query.text`, which this option does not
  control, and no bound values. The option is off so that enabling a database integration later
  cannot start sending user input.
- `stackFrameVariables` is read only by the Node `LocalVariables` integration
  (`integrations/local-variables/local-variables-async.js` in `@sentry/node`), which is off unless
  the `includeLocalVariables` client option is set. The repository never sets it. The option is off
  so that turning that client option on cannot attach local variables, which can hold user input.
- `queues` is read only by the Kafka integration (`integrations/kafkajs/spans.js` in
  `@sentry/server-utils`), which attaches the message key. `kafkajs` is not a dependency. The AWS
  SDK instrumentation that covers SQS does not read the option. It is off so that adding a queue
  integration later cannot start sending task arguments.
- `graphQL` is read only by the GraphQL integration (`integrations/graphql/utils.js` in
  `@sentry/server-utils`), which attaches the operation document with literal values redacted and
  never attaches variable values. `graphql` is not a dependency, so nothing is attached today. Both
  flags are off so that adding a GraphQL server later cannot start sending operations.
- `userInfo: false` also means no automatic `user.*` fields from instrumentation and no client
  address on the Node HTTP server span. The repository never calls `setUser`.
- Browser reports reach Sentry through the Worker tunnel, which forwards only the envelope, so
  Sentry's connection-level IP is the Worker's, not the visitor's. Sentry project settings are not
  known from this repository.
- No replay integration is registered, so the client options set no replay sample rates.

The init sites are `backend/modules/on-error/sentry.mts` (shared by the API server and every
worker entrypoint), `web/sentry-server-options.ts`, `web/sentry-edge-options.ts`,
`web/sentry-client-options.ts`, `lambdas/shared/sentry.mts` and `cloudflare-worker/src/sentry.mts`.
Each site's options test asserts the shared policy, typed against the SDK's `dataCollection`
option so a misspelled key fails type-checking. If a Lambda is deployed with the
`--import @sentry/aws-serverless/awslambda-auto` preload, that preload calls `init()` with default
options, but `initSentry()` replaces the client at module load, before any invocation. Every
data-collection gate reads the current client (`getClient()`) per request, so the policy applies.

`httpBodies` gates only the SDK's own body capture (`integrations/http/server-subscription.js` in
`@sentry/core`, `integrations/httpServer.js` in `@sentry/cloudflare`). `requestdata.js` still
copies any body data already on the scope into `event.request.data` and the
`http.request.body.data` span attribute. As a backstop, `scrubSentryEvent` drops `request.data`
and `scrubSpanAttributes` drops `http.request.body.data`. The credential and URL scrubbers also
stay in place for headers, cookies and query strings that reach Sentry by another path.

These SDK behaviors were verified by reading `@sentry/core@11.0.0`
(`utils/data-collection/resolveDataCollectionOptions.js`, `utils/request.js`,
`integrations/requestdata.js`, `integrations/http/server-subscription.js`,
`integrations/supabase.js`, `integrations/mcp-server/transport.js`, `tracing/spans/envelope.js`),
`@sentry/node@11.0.0` (`integrations/local-variables/local-variables-async.js`),
`@sentry/server-utils@11.0.0` (`ai/core/utils.js`, `integrations/index.js`,
`integrations/graphql/utils.js`, `integrations/kafkajs/spans.js`,
`integrations/vercel-ai/vercel-ai-dc-subscriber.js`) and
`@sentry/cloudflare@11.0.0` (`integrations/httpServer.js`, `wrapRequestHandlerWithInit.js`).

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

The client IP, cookies, query strings, request bodies, bound database values, stack-frame
variables, queue task arguments, GraphQL operations and gen-AI content are off at the source through `dataCollection` (see
[Data collection](#data-collection-the-least-data-policy)). The scrubbers still drop
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

The data-collection tests pin the policy values, and each site's test pins that the site passes the
shared policy. They do not invoke the SDK. What each option does inside the SDK, including that the
client-IP header deny list filters `http.request.header.*` span attributes, was verified by reading
the source above and by a one-off call of `httpHeadersToSpanAttributes` with the resolved policy,
not by a test in this repo.

## Related

- [Error handling architecture](../../overview/architecture/error-handling.md)
- [Client-side onError](../../overview/architecture/web/lib/on-error/README.md)
- [Backend onError](../../overview/architecture/backend/modules/on-error/README.md)
