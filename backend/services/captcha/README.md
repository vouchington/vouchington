# @services/captcha

Server-side CAPTCHA verification using Cloudflare Turnstile.

## What it does

Verifies a Cloudflare Turnstile token submitted by the client against the Turnstile siteverify API. Verification is **required for every non-honeypot request** to a protected endpoint — the route calls `verifyCaptchaOrAttestation` after honeypot and basic input checks short-circuit. That call either verifies a native App Attest assertion (see [App Attest bypass](#app-attest-bypass) below) or falls back to `verifyCaptchaToken`, which hits Cloudflare's siteverify API (unless the `SKIP_CAPTCHA_VERIFICATION` test bypass is set; see below).

### Protected endpoints

| Endpoint                                   | Action                             | actionTag                      |
| ------------------------------------------ | ---------------------------------- | ------------------------------ |
| `POST /api/v1/auth/email-address/tokens`   | Request an email OTP login token   | `auth.email-address-tokens`    |
| `POST /api/v1/posts`                       | Create a post or comment           | `posts.create`                 |
| `POST /api/v1/communities/:idOrSlug/posts` | Create a community post            | `communities.create-post`      |
| `POST /api/v1/communities`                 | Create a community                 | `communities.create`           |
| `POST /api/v1/topic-recommendations`       | Create a topic recommendation      | `topic-recommendations.create` |
| `POST /api/v1/reports`                     | Submit a content/moderation report | `reports.create`               |
| `POST /api/v1/disputes`                    | Submit a dispute                   | `disputes.create`              |
| `POST /api/v1/appeals`                     | Submit an appeal                   | `appeals.create`               |

Each protected route calls `verifyCaptchaOrAttestation(ctx, body, { actionTag, fieldNames? })`.
Token/header inspection is a route-level concern (like the honeypot fields) and is not threaded
into service-layer inputs. In the Turnstile fallback, missing, `null`, non-string, empty, and
whitespace-only token values are treated as absent and return `422 CAPTCHA token is required`.

### Test/integration bypass

`SKIP_CAPTCHA_VERIFICATION=true` makes `verifyCaptchaToken` a no-op (it skips both the missing-token check and the siteverify call). It is set for DB-backed route and web-api integration Vitest suites (via [`backend/test-helpers/vitest.setup.captcha-skip.mts`](../../test-helpers/vitest.setup.captcha-skip.mts)) and for the Playwright e2e backend, so those suites exercise content-creation endpoints without a live Cloudflare dependency. The CAPTCHA contract itself (422 on missing token, token forwarding) is covered by dedicated `.mock.test.mts` files that mock `@services/captcha`. Backend startup ([`serve.mts`](../../entrypoints/api/serve.mts)) refuses to boot on a deployed environment when the flag is set.

Staging operators can also toggle DynamicConfig `turnstile-config.always_approve`. When `ENVIRONMENT` is `staging` and that field is boolean `true`, `verifyCaptchaToken` uses the same no-op as SKIP (missing token and siteverify). Production never honors the field. Public clients read `GET /api/v1/captcha-config`. This is not an env var and is not part of infrastructure configuration. See [staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md).

## Env vars

| Variable                          | Required          | Description                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | Staging/prod only | Server-side secret key. When unset (or whitespace-only) in normal dev/test, the service falls back to Cloudflare's public always-pass test secret `1x0000000000000000000000000000000AA`. The full list of rejected-in-production test secrets — always-pass, always-fail, and token-already-spent — is exported as `CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS` from `@services/captcha`. |

The matching frontend runtime-public env var is `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` (see [`web/lib/turnstile-config.ts`](../../../web/lib/turnstile-config.ts) and [`web/lib/runtime-public-config-server.ts`](../../../web/lib/runtime-public-config-server.ts)). Both production checks fail loud: the backend boot check in [`backend/entrypoints/api/serve.mts`](../../entrypoints/api/serve.mts) exits non-zero in `NODE_ENV=production` when the secret matches any value in `CLOUDFLARE_TURNSTILE_TEST_SECRET_KEYS` (the always-pass default plus the always-fail and token-already-spent test secrets), and the web runtime-public config check throws when the site key is unset, blank, or matches any value in `TURNSTILE_TEST_SITE_KEYS` (the always-pass, always-fail, and force-interactive Cloudflare test site keys) without an explicit `ALLOW_TURNSTILE_TEST_KEY=true` opt-in. CI/test runtime smoke checks may set that opt-in; deployed staging/production tasks wire real keys and intentionally omit `ALLOW_TURNSTILE_TEST_KEY` so a misconfigured runtime value fails before serving the page.

## Usage

```typescript
import { verifyCaptchaOrAttestation } from '@services/captcha'

// Verifies an App Attest assertion when the request carries `x-app-attest-*` headers; otherwise
// falls back to Turnstile. Throws 422 if the Turnstile token is missing; 400 if the assertion's
// challenge is missing/expired, 403/409 ATTESTATION_REJECTED if the assertion itself is rejected;
// 403 BYPASS_DISABLED if App Attest headers are present but the bypass isn't enabled; 502 if
// siteverify is unreachable.
await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'posts.create' })
```

## App Attest bypass

Native iOS clients that have completed [App Attest](../app-attestation/README.md) key
attestation can skip the Turnstile round-trip entirely by sending a per-request assertion instead
of a `cf_turnstile_response` token. `verifyCaptchaOrAttestation` is the single entry point every
protected route calls; it decides between the two paths per request:

1. Reads three raw headers: `x-app-attest-key-id`, `x-app-attest-assertion`,
   `x-app-attest-challenge-id`.
2. **All three present and non-empty** → the App Attest path. If
   `!isAppAttestationEnabled() || !isAttestationRequiredForBypass()` (see
   [`@services/app-attestation`'s `config.mts`](../app-attestation/README.md)), throws `403 App Attest bypass is not enabled`. Otherwise calls `verifyAssertion` from `@services/app-attestation`
   with `` payload: `${challengeId}:${actionTag}` `` and the assertion decoded from base64. Any
   thrown error propagates unmodified — a missing/expired challenge is `400`; every other
   rejection (unknown key, device mismatch, disallowed environment, invalid assertion, sign-count
   regression) is `403` or `409 ATTESTATION_REJECTED` — **a present-but-invalid assertion rejects
   the request; it never falls back to Turnstile.**
3. **Any header missing** → falls back to
   `verifyCaptchaToken(extractTurnstileTokenFromBody(body, fieldNames), ctx.ip)`, unchanged from
   the pre-App-Attest behavior.

`actionTag` is a literal string constant per call site (see the endpoint table above) — it is
never derived from the request body, so an assertion minted for one endpoint cannot be replayed
against another. `fieldNames` is forwarded to `extractTurnstileTokenFromBody` for routes whose
Turnstile field has a non-default name (e.g. `auth.email-address-tokens` accepts both
`cf_turnstile_response` and `cfTurnstileResponse`).

The matching Swift-side action tags live in
[`AppAttestActionTag.swift`](https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Sources/VouchaAuth/AppAttestActionTag.swift)
and must stay in sync with this table.

## How verification works

1. Client renders a Turnstile widget via the `useTurnstile` hook ([`web/hooks/use-turnstile.ts`](../../../web/hooks/use-turnstile.ts)) using `TURNSTILE_SITE_KEY` from [`web/lib/turnstile-config.ts`](../../../web/lib/turnstile-config.ts), and obtains a token on success.
2. Client submits the token as `cf_turnstile_response` in the request body.
3. Server calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret key, token, and client IP.
4. If `success` is `false`, a 400 error is thrown. Network/HTTP failures throw 502.
5. In dev/test, the public test site key + public test secret key always succeed against Cloudflare without exercising real bot-detection — this exercises the same code path that runs in production without requiring real keys.

## Frontend usage

Forms posting to a Turnstile-gated endpoint use the shared `useTurnstileToken()` hook ([`web/hooks/use-turnstile-token.ts`](../../../web/hooks/use-turnstile-token.ts)) + `<TurnstileField>` ([`web/components/shared/turnstile-field.tsx`](../../../web/components/shared/turnstile-field.tsx)) rather than re-wiring `useTurnstile` inline. The form: renders `<TurnstileField>`, disables submit while `!token`, forwards the token as `cf_turnstile_response` in the mutation payload, and calls `reset()` after a submission that consumed the token (single-use). Web unit tests receive a ready token from the global `@/hooks/use-turnstile-token` mock in [`web/test-helpers/vitest.setup.web.mts`](../../../web/test-helpers/vitest.setup.web.mts); Storybook does the same in [`web/.storybook/vitest.setup.ts`](../../../web/.storybook/vitest.setup.ts).

## Related

- [Auth API](../../api/v1/sessions-authentication/README.md)
- [Honeypot Service](../honeypot/README.md)
- [Local env var matrix](../../../docs/development/local-env-vars.md)
- [Staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md)
- [Captcha config API](../../api/v1/captcha-config/README.md)
