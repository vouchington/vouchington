---
name: vouchington-qa
description: Walk Voucha user flows in a live browser, local (https://localhost:$WORKER_PORT) or staging.voucha.ai (Basic Auth, OTP, Stripe test checkout, AWS logs). Use when asked to QA, verify a flow end to end, or check staging.
user-invocable: true
---

# Voucha QA

Load `claude-in-chrome` first. Local stack startup: [local-site-testing](../local-site-testing/SKILL.md).
Never mix targets: local is `https://localhost:$WORKER_PORT` (`http` when `dev/certs/localhost.pem` and
`localhost-key.pem` are absent); staging is `https://staging.voucha.ai`. Never use a direct Next.js or ALB
origin; the Cloudflare Worker is the only browser entry.

## Scope and recording

Read the flow matrices instead of copying them: [user-flows](../../../docs/requirements/user-flows/README.md)
(Sources, Topics, Posts) and [signed-out actions](../../../docs/requirements/navigation/SIGNED_OUT_ACTIONS.md).
Persona coverage collapses by entity: Sources and Topics use Anon / RU / SA; Posts use Anon / RU / CM or CO / SA.
Record each cell as ✅ works, ❌ broken, ⚠️ rough edge, 📄 doc mismatch. Impossible persona cells are skipped
with a reason, not ❌.

Open tabs with `tabs_context_mcp` then `tabs_create_mcp`; never reuse tab IDs from a prior session.

File only independently verified ❌ product bugs through `jong-skills:github-issue`; search first. Do not file
skipped cells, empty data, or 📄 unless the mismatch is itself a docs bug.

## Local

`.env` sourced and the full stack running.

```bash
pnpm run login-as -- <email>                     # regular user
pnpm run login-as -- <email> --role moderator
pnpm run login-as -- qa-developer@voucha.ai --role developer
pnpm run login-as -- --all                       # all standard personas
pnpm run db:seed                                 # sources, topics, articles from seed/*.csv
pnpm run seed-source                             # deterministic source at /sources, no workers or network
```

`login-as` mints an OTP deep-link; load it, then click **Log in** on the prefilled step (focusing the tab does
not submit; no CAPTCHA locally). `/login` redirects signed-in users: sign out via the account menu before the
next persona, or use a fresh incognito window. Never-logged-in emails need a real-MX domain (`@voucha.ai`) and
network, so run that first call with the sandbox disabled; afterward they are DNS-free. Seeded admin
`tests@voucha.ai` (`00000000-0000-0000-0000-000000000000`) is always DNS-free. Source submit plus crawl needs
IO/CPU workers; prefer `seed-source`.

## Staging

Default scope is `staging-unique`: edge Basic Auth, home/list smoke, email OTP, membership, gated create, AWS
log correlation. `scope=full` walks every matrix row the account can execute. Detect the account role from the
signed-in chrome and `GET /api/v1/my/contribution-status` before create or Stripe; one account cannot cover
CM/CO/SM/SA unless it holds the role.

**Credentials.** `source ~/voucha.env`; if it replaces `PATH`, restore a login `PATH` and `hash -r` before
`curl`, `aws`, `gh`, `python3`. Basic Auth order, fail closed, never print the password:
`VOUCHA_STAGING_BASIC_AUTH_CREDS` (`user:pass`), else `STAGING_USER` + `STAGING_PASS`
([staging Basic Auth](../../../docs/operations/cloudflare-worker-staging-auth.md)).

Use two isolated browser contexts with Basic Auth on both. The anonymous context never receives session
cookies; only the authenticated one signs in. To check personalized-data isolation, request the same URL in both
and confirm the authenticated response does not reuse anonymous cached HTML. Do not inject `Authorization: Basic`
via DevTools `extraHttpHeaders` (it reaches `challenges.cloudflare.com` and fails Turnstile with `600010`); use
origin-scoped auth (`https://user:pass@staging.voucha.ai/…`). Requests consume the identity rate limiter before
the 401 challenge; do not burst.

**Email OTP.** Follow [AUTH.md](../../../docs/requirements/security/AUTH.md). Use the operator's own staging test
inbox (the "Staging QA operator" section of the first-deploy checklist in private `vouchington-infra`, org access
required; pass as `<operator-email>`). The local CAPTCHA exemption does not apply; the login link still needs a
deliberate **Log in** click. Prefer the `/login?emailAddress=…&otp=…` deep link.

**Turnstile in MCP Chrome.** A real site key (`0x4…`) with a loaded widget means wiring is fine; MCP Chrome still
reads as automation (`600010`, "Verification failed"). Prefer origin-scoped Basic Auth; otherwise a staging
administrator may enable DynamicConfig `turnstile-config.always_approve` (never honored in production), then
disable it when the session ends. Never change Turnstile keys. Complete Turnstile and "Continue with email" in
everyday Chrome when the knob is off; use the MCP Gmail tab only to read the OTP or link. See
[staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md).

**Stripe (test mode).** Check `/my/membership`; skip checkout if already Plus or Pro. Otherwise `/plans`, Plus
monthly, card `4242424242424242`, any future expiry, CVC, ZIP. Activation is `invoice.paid`, not
`checkout.session.completed`; poll `/my/membership` until `active` or `past_due`, confirm downvote counts show on
a post, then cancel at period end. No Stripe Identity or refunds; a decline card must not leave `incomplete`
blocking success. Plus unblocks `account_too_new` / just_joined create cells; finish Stripe before them (admin is
never gated).

**Logs.** Before flows, and after any 5xx, blank shell, unexpected toast or failed write, follow
[Deployed Error Investigation](../../../docs/operations/deployed-error-investigation.md) (alarms, log groups,
Logs Insights, DLQ sampling, Sentry fallback). Correlate by `x-request-id` / JSON `request_id`
([error handling](../../../docs/overview/architecture/error-handling.md)); never dump unbounded log pages. A
user-visible 5xx or silent failure with no CloudWatch line and no Sentry event is a missing log: do not edit
backend or web mid-QA; file it via `jong-skills:github-issue` or follow up after the run. Expected 4xx stays
suppressed.

**Database reset.** No Vouchington workflow exists. Use the "Staging database reset" step of the first-deploy
checklist in private `vouchington-infra` (org access). It resets only the PostgreSQL `public` schema; wait for
service-count restoration and `/infra/ping` `200`/`pong`, then start a fresh authenticated browser context
(Valkey sessions are retained). Never substitute ad hoc AWS or SQL.
