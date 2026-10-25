# CAPTCHA & Bot Protection

Voucha runs two complementary anti-abuse mechanisms on content-creation actions:

- **Cloudflare Turnstile** — an interactive challenge that is the **hard gate**: a missing or
  invalid token is rejected outright. Added in #4452.
- **Google reCAPTCHA Enterprise** — an **invisible, score-based** signal layered _alongside_
  Turnstile on post/comment creation only. Monitor-only by default; it never replaces Turnstile.
  Added in #4445.

## Action × provider matrix

| Action                    | Endpoint                                                           | Turnstile | reCAPTCHA Enterprise  |
| ------------------------- | ------------------------------------------------------------------ | --------- | --------------------- |
| Create post               | `POST /api/v1/posts`                                               | ✅        | ✅ (`create_post`)    |
| Create comment            | `POST /api/v1/posts` (with `parent_post_id`)                       | ✅        | ✅ (`create_comment`) |
| Create community post     | `POST /api/v1/communities/:idOrSlug/posts`                         | ✅        | ✅ (`create_post`)    |
| Create community comment  | `POST /api/v1/communities/:idOrSlug/posts` (with `parent_post_id`) | ✅        | ✅ (`create_comment`) |
| Create community          | `POST /api/v1/communities`                                         | ✅        | ❌                    |
| Submit report             | `POST /api/v1/reports`                                             | ✅        | ❌                    |
| Submit dispute            | `POST /api/v1/disputes`                                            | ✅        | ❌                    |
| Submit appeal             | `POST /api/v1/appeals`                                             | ✅        | ❌                    |
| Recommend topic           | `POST /api/v1/topic-recommendations`                               | ✅        | ❌                    |
| Request email login token | `POST /api/v1/auth/email-address/tokens`                           | ✅        | ❌                    |

reCAPTCHA is intentionally scoped narrowly (post/comment creation) because it is billed per
assessment. The service helper (`@services/recaptcha`) is built to extend to other actions later.

## Order of checks

Both run inside the route handler, after the cheaper checks, so we never spend an assessment on a
request that was going to be rejected anyway:

```
authentication → authorization → rate limit → honeypot → Turnstile (hard gate) → reCAPTCHA (last)
```

reCAPTCHA runs **last** and only on requests that have already cleared everything else. On staging
only, DynamicConfig `turnstile-config.always_approve` can skip the Turnstile hard gate so MCP QA
can proceed; production never honors that field. See
[staging Turnstile always-approve](../../operations/staging-turnstile-always-approve.md).

## Turnstile token parsing

Protected routes should read Turnstile tokens with
`extractTurnstileTokenFromBody()` from `@services/captcha`, then pass the result to
`verifyCaptchaToken(token, ctx.ip)`.

- The canonical request body field is `cf_turnstile_response`.
- `POST /api/v1/auth/email-address/tokens` also accepts the legacy camelCase
  `cfTurnstileResponse` alias.
- Missing, `null`, non-string, empty, and whitespace-only values are treated as absent and return
  `422 CAPTCHA token is required`.
- The parsed token is a route-level anti-abuse field and should not be threaded into service-layer
  business inputs.

## App Attest bypass

Native Apple clients that have completed Apple **App Attest** key attestation can skip the
Turnstile round-trip entirely by sending a per-request hardware-backed assertion instead of a
`cf_turnstile_response` token. `verifyCaptchaOrAttestation()` is the single entry point every
protected route in the table above calls — it reads three headers
(`x-app-attest-key-id`, `x-app-attest-assertion`, `x-app-attest-challenge-id`); if all three are
present it verifies the assertion and never falls back to Turnstile (an invalid assertion is
rejected outright), and if any is missing it falls back to the Turnstile flow described above
unchanged.

See [app-attestation.md](app-attestation.md) for the full attestation/assertion flow, the
`dc`-claim session-duration mechanism, and replay defenses, and
`docs/overview/architecture/services/README.md` § App Attest bypass
for the exact decision logic and error codes.

## Low-score mutation proof

The Cloudflare Worker removes caller-supplied bot-score metadata and forwards a score only from
Cloudflare's request context. The API trusts that signal only on a Worker-authenticated origin
request and asks cookie-session mutations with a low score for a separate, generic proof. Missing
metadata intentionally leaves the request unchanged so deployments without granular Bot
Management degrade gracefully.

The generic Turnstile token travels in its own header rather than the route body's
`cf_turnstile_response`, so a successful retry does not spend one single-use token at two gates.
After a successful generic proof, the verified session receives a short-lived clearance. This
prevents repeated interactive challenges during a burst of protected writes while keeping the
clearance tied to that session rather than the account. A new session for the same account must
prove again. Operators can disable clearance through DynamicConfig; that setting takes
effect even for sessions whose earlier clearance has not expired. Route-specific CAPTCHA,
passkey, vote and request-signing checks still apply.
Native clients select the equivalent App Attest operation challenge with the shared `app-attest`
marker in that header and put its assertion in the dedicated bot-challenge App Attest headers. The
marker is not an exemption: the hardware-backed assertion must still verify against the generic
operation. The standard App Attest headers remain available for a distinct route-specific
assertion, so each single-use challenge is consumed only by its owning verifier. Because challenge
assertions share a monotonic device counter, a native client generating the generic assertion after
an earlier route assertion must re-sign the still-unused route challenge before retrying.

## reCAPTCHA behaviour

### Skip conditions (no assessment, request proceeds)

The assessment is skipped — failing open — when any of these hold:

- `recaptcha-config` `enabled` is `false` (the shipped default).
- The process is not a deployed environment (`isDeployedEnvironment()` from
  `@ts-shared/deploy-environment`, i.e. `ENVIRONMENT` is not `staging` or `production`) — dev and
  test never call the paid API.
- credentials are not fully configured (see [env vars](#configuration)).
- the user is **high-trust** (an administrator; there is no other trust tier today).
- no `recaptcha_token` was supplied by the client.
- the daily **429 lockout** is in effect.

### Monitor vs block

1. **HTTP 429** from Google → set a Valkey key (`recaptcha:assessment-lockout`) that expires at
   midnight UTC, stop calling the API for the rest of the day, and fail open. (“One 429 per day is
   fine.”)
2. **Any other error, invalid token, or missing score** → log to Sentry and fail open.
3. **Valid score below `block_threshold`**:
   - **Always** logged to Sentry (score, action, reasons, user id) — even in monitor mode.
   - If `blocking_enabled` is `true`, the request is rejected with a **generic** error
     (`"Unable to submit your request right now. Please try again."`). The client is never told a
     reCAPTCHA score caused the rejection; the real reason goes to Sentry only.
   - If `blocking_enabled` is `false` (default), the request proceeds (monitor mode).

Every failure path fails open: reCAPTCHA must never break content creation.

## Configuration

Runtime knobs live in Valkey **DynamicConfig** (admin-editable + audited via
`/api/v1/dynamic-config/namespaces/…`; edited through `/admin/dynamic-config`).
They are DynamicConfig values, **not feature flags** — backend behaviour must never be gated by a
feature flag (`backend/api/AGENTS.md`).

### Turnstile

| Field            | Type    | Default | Meaning                                                                                        |
| ---------------- | ------- | ------- | ---------------------------------------------------------------------------------------------- |
| `always_approve` | boolean | `false` | Staging-only skip of missing-token and siteverify. Production ignores it. Administrators only. |

Credentials stay env-backed (`CLOUDFLARE_TURNSTILE_SECRET_KEY`,
`NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`). Toggle procedure:
[staging Turnstile always-approve](../../operations/staging-turnstile-always-approve.md).

### reCAPTCHA

Runtime knobs live in the `recaptcha-config` namespace.

| Field              | Type    | Default | Meaning                                            |
| ------------------ | ------- | ------- | -------------------------------------------------- |
| `enabled`          | boolean | `false` | Call the paid assessment API at all                |
| `blocking_enabled` | boolean | `false` | Enforce (reject low scores) vs monitor (log only)  |
| `block_threshold`  | number  | `0.5`   | Score below which a request is low-trust (`0`–`1`) |

Secrets/keys come from env: `GOOGLE_RECAPTCHA_PROJECT_ID`, `GOOGLE_RECAPTCHA_API_KEY`,
`GOOGLE_RECAPTCHA_SITE_KEY` (the public site key, same value the web app reads via
runtime-public config such as `NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY`). Names and sensitivity are in the typed `@ts-shared/env-contract`.

## Testing

- **Turnstile** uses Cloudflare's public always-pass test keys in normal local dev. Real Turnstile
  env vars are only needed for deployed staging/production or explicit local opt-in. Tests may also
  use `SKIP_CAPTCHA_VERIFICATION` for route coverage that does not exercise the provider contract.
  Staging operators can set DynamicConfig `turnstile-config.always_approve` to skip verification
  without changing stored Turnstile credentials; production never honors that field. See
  [staging Turnstile always-approve](../../operations/staging-turnstile-always-approve.md).
- **reCAPTCHA** has no usable score-based test key (Google's well-known keys are reCAPTCHA v2 and
  return no `score`; Enterprise publishes none), so tests mock the assessment. Combined with the
  deployed-environment guard (`isDeployedEnvironment()`), no real assessment is ever made in dev or
  test.

## Related

- Turnstile service: ../../../docs/overview/architecture/services/README.md
- Staging always-approve: [../../operations/staging-turnstile-always-approve.md](../../operations/staging-turnstile-always-approve.md)
- reCAPTCHA service: ../../../docs/overview/architecture/services/README.md
- Dynamic Config: [architecture](dynamic-config.md)
- Local env var matrix: [../../development/local-env-vars.md](../../development/local-env-vars.md)
- Feature flags vs DynamicConfig: [feature-flags.md](feature-flags.md)
