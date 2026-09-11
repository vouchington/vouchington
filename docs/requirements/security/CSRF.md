# CSRF Protection

Cross-Site Request Forgery (CSRF) policy for the Voucha API. Tracked by
[#6386](https://github.com/jonathanong/filaments/issues/6386).

## Threat model

Browser sessions authenticate with the `dt` (device) and `st` (session) cookies set by
[`set-authentication-cookies.mts`](../../../backend/modules/api-utils/set-authentication-cookies.mts)
— see [Auth Overview](../../overview/architecture/auth-overview.md) for the full token lifecycle.
The Cloudflare Worker strips any client-supplied auth headers
([`proxy.mts`](../../../cloudflare-worker/src/proxy.mts)), so browser ambient authority is
**cookie-only**. That makes CSRF — a cross-site page causing the victim's browser to send an
authenticated state-changing request — the relevant cross-site threat. Non-browser clients
(native apps, server-to-server) authenticate with `Authorization: Bearer` and cannot be driven
cross-site by a web page, so they are not CSRF vectors.

## Decision: no CSRF tokens

We do **not** use double-submit or synchronizer CSRF tokens. For a same-origin SPA the layered
defenses below already make a forged state-changing request impossible to construct in a browser;
tokens would add ceremony and zero marginal security. The protection is defense-in-depth — each
layer independently blocks the attack.

## The layers

1. **Worker strips client auth headers.** Ambient authority is cookie-only, so CSRF is the only
   cross-site vector (no header-injection auth to forge).
2. **`SameSite=Lax` session cookies.** Browsers do not attach `dt`/`st` to cross-site
   `POST`/`PUT`/`PATCH`/`DELETE` or to any cross-site subresource/`fetch`, so a cross-site form
   submission arrives unauthenticated.
3. **Origin guard** — [`app-origin-guard.mts`](../../../backend/api/app-origin-guard.mts). On every
   mutating method it rejects `Sec-Fetch-Site: cross-site` and `Origin`≠forwarded-host. It applies
   to **all** mutating requests that carry a browser-context signal (a session cookie, an `Origin`,
   or a `Sec-Fetch-Site` header), which covers pre-auth routes (login/signup) too — not just
   cookie-bearing ones. Requests with no browser signal at all are server-to-server (webhooks,
   signed callbacks) authenticated by signature/shared key, and are allowed through (the route's
   own auth still applies). `Authorization: Bearer` requests are exempt.
4. **JSON-only content type** — api-server rejects a request that **carries a body** (detected via
   `Content-Length` / `Transfer-Encoding`) whose `Content-Type` is not JSON, including an
   **absent** `Content-Type` (a cross-site `fetch` with a typeless `Blob` omits it), for every
   mutating route by default. The signed CRM and email unsubscribe routes explicitly accept
   `application/x-www-form-urlencoded` because they authenticate with signed tokens rather than
   cookies. HTML forms can only send `application/x-www-form-urlencoded`,
   `multipart/form-data`, or `text/plain` — never `application/json` — so form-based CSRF cannot
   produce a body the API will accept. Bodyless mutations are allowed through because there is
   nothing to parse.
5. **No cross-origin CORS.** The API sets no `Access-Control-Allow-Origin` and has no preflight
   handler (the only `ACAO: *` is on `/_next/static/*`, GET assets, and `*` is incompatible with
   credentials). So a cross-origin credentialed `fetch` with `Content-Type: application/json` — the
   only way to send JSON cross-site — is blocked at the CORS preflight and never reaches the origin.

A forged cross-site mutation must defeat all of layers 2–5 simultaneously, which is not possible
in a modern browser.

## Exemptions

External webhook/infra endpoints authenticate via cryptographic signatures or shared keys, not
cookies, so they are not CSRF targets. SES bounce/complaint notifications and Stripe webhook events
no longer hairpin through a public endpoint: both arrive over SQS (SNS→SQS for SES,
EventBridge→SQS for Stripe) that a backend worker consumes directly (see
[event-ingress.md](../../overview/architecture/event-ingress.md)), so there is nothing to exempt
here. The worker-secret check has its own `WORKER_SECRET_EXEMPT_PATHS` list, pinned by tests so
additions are reviewed.
Server-to-server requests are exempt from the origin guard structurally (no browser signal), as
described in layer 3.

## Adding routes

- State-changing routes parse JSON bodies with bounded parsers such as `parseJsonBody` from
  [`response-helpers.mts`](../../../backend/api/response-helpers.mts). Do not add endpoints that
  consume `urlencoded`, `multipart`, or other non-JSON request bodies — convert the payload to a
  JSON field instead (e.g. CSV/OPML imports send `{ csv }` / `{ opml }`). Use
  `ctx.request.is('json')` only when media type changes route semantics, when a bodyless action's
  API contract still requires a JSON media type, or when an abuse-control rate limit intentionally
  runs before body parsing. Do not use it as a guard immediately before `request.json()`. Parse and
  validate the body before consuming business quotas or making other mutations.
- Do not add non-JSON mutation media types or a path to `WORKER_SECRET_EXEMPT_PATHS` unless it is an
  externally-authenticated endpoint; document the route-level rationale and update its tests.
