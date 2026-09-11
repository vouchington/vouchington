# Staging Turnstile Always-Approve - Runbook

Toggle Cloudflare Turnstile verification off (always approve) on staging so Chrome DevTools MCP
agents can complete login and gated creates. Stored Turnstile credentials stay unchanged. No
OpenTofu apply.

## Scope

- Affected service or feature: backend Turnstile verification and the web widget on
  `staging.voucha.ai`.
- Environments: staging only. Production ignores `turnstile-config.always_approve` even if the
  field is `true`.
- Operator role or permission needed: staging administrator. Namespace `update_roles` is empty, so
  developers and other Dynamic Config viewers cannot write it.
- Out of scope: changing `/voucha/staging/turnstile-secret-key`, `turnstile_site_key`, OpenTofu,
  ECS task env, `SKIP_CAPTCHA_VERIFICATION` (still boot-fatal on staging and production), or
  production.

## Source Of Truth

- Implementation: [`backend/services/captcha/config.mts`](../../backend/services/captcha/config.mts)
  (`TURNSTILE_CONFIG_KEY`, `isTurnstileAlwaysApprove`),
  [`verify.mts`](../../backend/services/captcha/verify.mts),
  [`GET /api/v1/captcha-config`](../../backend/api/v1/captcha-config/README.md).
- Infrastructure/config: Valkey DynamicConfig namespace `turnstile-config`. Not an SSM parameter
  and not an ECS environment variable.
- CI or deploy workflow: none. Toggle after the app that contains this code is already deployed.
- Related docs: [captcha architecture](../overview/architecture/captcha.md),
  [Turnstile env vars](../overview/infrastructure/reference-environment-variables-bot-protection-turnstile.md),
  [staging-qa skill](../../.agents/skills/staging-qa/SKILL.md).

```mermaid
flowchart TD
  start["MCP blocked on staging /login"] --> origin["Prefer origin-scoped Basic Auth"]
  origin --> extra["Do not inject Authorization Basic via extraHttpHeaders"]
  extra --> widget{"Widget still 600010 in MCP Chrome?"}
  widget -- "No, everyday Chrome works" --> everyday["Complete Turnstile in everyday Chrome"]
  widget -- "Yes" --> admin["Administrator sets turnstile-config.always_approve true"]
  admin --> pubsub["Valkey pub/sub updates API in-memory config"]
  pubsub --> reload["Reload /login so GET /api/v1/captcha-config is refetched"]
  reload --> skip["Web skips Cloudflare script and widget; verifyCaptchaToken no-ops"]
  skip --> qa["Finish MCP QA"]
  qa --> off["Set always_approve false"]
  off --> gate["Widget and 422 missing-token hard gate restored"]
```

## Prerequisites

- Required local tools: `curl`, staging Basic Auth, a staging administrator session (browser
  `/admin/dynamic-config` or `PATCH /api/v1/dynamic-config/namespaces/turnstile-config`).
- Required cloud access: none beyond staging. CloudWatch is optional for the skip log.
- Required secrets or environment variables: staging Basic Auth. Do not rotate Turnstile keys.
- Preflight checks:
  1. The always-approve code is deployed to staging (the public GET and `turnstile-config`
     namespace exist).
  2. Origin-scoped Basic Auth first (`https://user:pass@staging.voucha.ai/…` or the browser
     prompt). Do not inject `Authorization: Basic` via Chrome DevTools `extraHttpHeaders` — that
     leaks to `challenges.cloudflare.com` and causes Turnstile `600010`.
  3. Confirm you are targeting staging, not production. A production PATCH would store the field
     but `isTurnstileAlwaysApprove()` still returns false.

Use this toggle only when MCP Chrome still cannot complete the widget after origin-scoped Basic
Auth. Everyday Chrome on staging should keep exercising the real widget whenever the knob is off.

## Procedure

### Enable

1. Confirm `GET /api/v1/captcha-config` on staging currently returns `"always_approve": false`.
2. Sign in as a staging administrator and open `/admin/dynamic-config`. Open namespace
   `turnstile-config` and set `always_approve` to `true`.
3. Or `PATCH /api/v1/dynamic-config/namespaces/turnstile-config` as that administrator with
   `{ "config": { "always_approve": true } }`. Non-administrators receive a write denial.
4. Wait for Valkey pub/sub (immediate on running API tasks) plus a hard reload of `/login` so the
   web client refetches `GET /api/v1/captcha-config`. CachedOrigin must not retain a skip-on
   snapshot (`Cache-Control: private, no-store`).

### Disable

1. Set `always_approve` to `false` through the same admin UI or PATCH.
2. Hard-reload `/login` and confirm the Turnstile widget is present and Continue is disabled until
   a token exists.

Leave the knob off except during MCP QA sessions so staging stays production-representative.

### Rollback

Same as Disable. If DynamicConfig is unavailable, unloaded, or the field is the wrong type,
Turnstile stays enforced (fail closed). Rolling back the app image also restores the hard gate
because production-path verification is the default.

## Verify

```bash
curl -sS -u "$STAGING_USER:$STAGING_PASS" \
  -D - \
  https://staging.voucha.ai/api/v1/captcha-config
```

Expected result:

- Enable: body `{ "always_approve": true }` and `Cache-Control: private, no-store`.
- Disable: body `{ "always_approve": false }`.
- MCP `/login` Continue works without a Turnstile widget when enabled. The page must not request
  `https://challenges.cloudflare.com/turnstile/v0/api.js`. Web still submits dummy token
  `turnstile-always-approve`; the backend also accepts a missing token while the knob is on.
- `POST /api/v1/auth/email-address/tokens` without `cf_turnstile_response` returns 422 when
  disabled.
- CloudWatch `/voucha/staging/backend` contains `Turnstile always-approve skip is active` after
  the first skipped verification in that API process.

Do not write `/voucha/staging/turnstile-secret-key`, change `turnstile_site_key`, set
`SKIP_CAPTCHA_VERIFICATION`, or run OpenTofu to toggle this.

Native clients decode `GET /api/v1/captcha-config` only. MCP QA is the web `/login` and gated
create path; do not treat native Turnstile WebViews as covered by this skip until those clients
honor the public signal.

## Stale-Doc Sync Notes

- `TURNSTILE_CONFIG_KEY`, `always_approve`, and `isTurnstileAlwaysApprove` in
  `backend/services/captcha/config.mts` (honor only when `getDeployEnvironment() === 'staging'`
  and the field is boolean `true`).
- `GET /api/v1/captcha-config` Cache-Control and honor rules.
- DynamicConfig registry namespace `turnstile-config` (`update_roles: []`).
- Web skip: `useTurnstile({ enabled: false })` must not load the Cloudflare script.
- Manual source verification is sufficient: the namespace is registered and boot-guards still
  reject `SKIP_CAPTCHA_VERIFICATION` on staging. There is no generated inventory for this boolean.

## See Also

- [CAPTCHA architecture](../overview/architecture/captcha.md)
- [Dynamic Config](../overview/architecture/dynamic-config.md)
- [staging-qa skill](../../.agents/skills/staging-qa/SKILL.md)
- [staging Basic Auth](./cloudflare-worker-staging-auth.md)
- [Captcha config API](../../backend/api/v1/captcha-config/README.md)
