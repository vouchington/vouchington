# recaptcha

Google reCAPTCHA Enterprise — an invisible, score-based anti-abuse signal layered **alongside**
Cloudflare Turnstile (`@services/captcha`) on content-creation endpoints. Turnstile stays the hard
gate; reCAPTCHA is monitor-only by default and only ever rejects when explicitly configured to.

## What it does

`assessRecaptchaToken({ currentUser, token, expectedAction, ip })` runs the **last** anti-abuse
check on a request, after auth → authorization → rate limit → honeypot → Turnstile. It is wired
into `POST /api/v1/posts` and `POST /api/v1/communities/:idOrSlug/posts` (`create_post` for
top-level posts, `create_comment` when a `parent_id` is present).

### Decision flow

1. **Skip** (no assessment, request proceeds) when any of:
   - `enabled` is `false` (DynamicConfig)
   - the process is not a deployed environment (`isDeployedEnvironment()` from
     `@ts-shared/deploy-environment`, i.e. `ENVIRONMENT` is not `staging` or `production`) — dev/test
     never call the paid API
   - credentials are not configured
   - the user is high-trust (admin — see `authorization.mts`)
   - no `recaptcha_token` was supplied
   - the daily 429 lockout is in effect
2. Otherwise call `createAssessment`.
   - **HTTP 429** → set a Valkey lockout key until end of UTC day, log, and **fail open**.
   - **any other error / invalid token / missing score** → log, **fail open**.
3. With a valid score:
   - `score >= block_threshold` → pass.
   - `score < block_threshold` → **always** log to Sentry; reject with a generic error **only** when
     `blocking_enabled` is `true`. The client never learns reCAPTCHA was involved; the real score
     and reasons go to Sentry.

Every failure path fails open: reCAPTCHA must never break content creation.

## Configuration

Runtime knobs live in DynamicConfig key `recaptcha-config` (admin-editable + audited via
`/api/v1/dynamic-config/namespaces/recaptcha-config`):

| Field              | Type    | Default | Meaning                                            |
| ------------------ | ------- | ------- | -------------------------------------------------- |
| `enabled`          | boolean | `false` | Call the paid assessment API at all                |
| `blocking_enabled` | boolean | `false` | Enforce (reject low scores) vs monitor (log only)  |
| `block_threshold`  | number  | `0.5`   | Score below which a request is low-trust (`0`–`1`) |

Secrets/keys come from env: `GOOGLE_RECAPTCHA_PROJECT_ID`, `GOOGLE_RECAPTCHA_API_KEY`,
`GOOGLE_RECAPTCHA_SITE_KEY` (the public site key; the web app reads the same value via
runtime-public `NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY`).

## Testing

There is no usable score-based test key (Google's well-known keys are reCAPTCHA v2 and return no
score; Enterprise publishes none), so tests mock `fetch-assessment`. Combined with the
deployed-environment guard (`isDeployedEnvironment()`), no real assessment is ever made in dev or
test.

See also: [captcha matrix](../../../docs/overview/architecture/captcha.md).
