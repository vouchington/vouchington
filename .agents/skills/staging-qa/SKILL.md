---
name: staging-qa
description: |
  Live browser QA of https://staging.voucha.ai. Use when walking
  docs/requirements/user-flows/ on staging, checking Stripe test checkout,
  correlating CloudWatch or Sentry logs, or filing confirmed staging bugs.
  Not for the local stack.
user-invocable: true
---

# Staging QA

Walk key user flows against **staging only**. Local QA is
[chrome-qa](../chrome-qa/SKILL.md). Do not point this skill at localhost or
production.

## Target

`https://staging.voucha.ai`

Never use a direct Next.js or ALB origin. The Cloudflare Worker is the only
browser entry.

## Credentials

`source ~/voucha.env` in the agent shell. If that file replaces `PATH`, restore a
normal login `PATH` and `hash -r` before calling `curl`, `aws`, `gh`, or
`python3`. Resolve Basic Auth in this order and **fail closed** if neither is
set. Never print, echo, or log the password.

1. `VOUCHA_STAGING_BASIC_AUTH_CREDS` — `user:pass` (first colon splits)
2. `STAGING_USER` + `STAGING_PASS` — see
   [staging Basic Auth](../../../docs/operations/cloudflare-worker-staging-auth.md)

Use two isolated browser contexts and put Basic Auth on both. The anonymous context must never
receive Voucha session cookies. Only the separate authenticated context may complete sign-in. When
checking personalized-data isolation, request the same URL in both contexts and confirm the
authenticated response does not reuse anonymous cached HTML.
Do **not** inject `Authorization: Basic` via Chrome DevTools `extraHttpHeaders`.
That header is sent on every request from the page, including
`challenges.cloudflare.com`, and Turnstile then fails with client error
`600010` (Private Access Token call returns 401). Prefer origin-scoped
HTTP auth (browser prompt, or `https://user:pass@staging.voucha.ai/…`).
Covered requests consume the identity rate limiter **before** the 401 challenge;
do not hammer the origin. A burst of authenticated page fetches can return 429
from the identity rate limiter even with valid Basic Auth.

## Recording

For each matrix cell use the chrome-qa symbols (✅ ❌ ⚠️ 📄). Impossible
persona cells are **skipped** with a reason, not ❌.

## Scope

Read the matrices. Do not copy them into prompts or this skill.

- [Sources](../../../docs/requirements/user-flows/sources.md)
- [Topics](../../../docs/requirements/user-flows/topics.md)
- [Posts](../../../docs/requirements/user-flows/posts.md)
- [Signed-out actions](../../../docs/requirements/navigation/SIGNED_OUT_ACTIONS.md)

Default workflow scope is `staging-unique`: edge Basic Auth, home/list smoke,
email OTP, membership, gated create, AWS log correlation. `scope=full` walks
every matrix row the current account can actually execute.

Persona collapse is in the [user-flows README](../../../docs/requirements/user-flows/README.md).
One account cannot cover CM/CO/SM/SA unless it already has that role. Detect
role from the signed-in chrome and
`GET /api/v1/my/contribution-status` before create or Stripe.

## Email OTP

Follow [AUTH.md](../../../docs/requirements/security/AUTH.md) email OTP and
deep-link steps. Inbox for this operator:
`https://mail.google.com/mail/u/1/#inbox` (default `jong@voucha.ai`).

Local chrome-qa “no CAPTCHA / login-as auto-submit” does **not** apply.

**Turnstile in Chrome DevTools MCP:** a real staging site key (`0x4…`, not a
test key) plus a loaded widget is enough to treat Worker/site-key wiring as
OK. The MCP Chrome is still treated as automation: the widget logs
`[Cloudflare Turnstile] Error: 600010` and “Verification failed.” That is
**not** a staging Cloudflare misconfig if the same `/login` page succeeds in
everyday Chrome.

Prefer origin-scoped Basic Auth first. If MCP still cannot complete the
widget, a staging administrator can enable DynamicConfig
`turnstile-config.always_approve` so the widget is skipped and the backend
accepts missing tokens. Production never honors that knob. Do not change
Turnstile site or secret keys. Disable the knob when the MCP session ends so
staging keeps exercising the real widget. See
[staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md).

Complete Turnstile and “Continue with email” in everyday Chrome when the
knob is off; use the MCP Gmail tab only to read the OTP or deep link.

Prefer the email deep link `/login?emailAddress=…&otp=…` when the inbox
shows it.

## Stripe

Staging is Stripe **test mode**. Inspect `/my/membership` first. Skip checkout
if the account is already Plus or Pro.

Otherwise `/plans` → Plus monthly → Checkout with `4242424242424242`, any
future expiry, any CVC, any ZIP. Activation is **`invoice.paid`**, not
`checkout.session.completed`
([Stripe integration](../../../docs/requirements/users/reference-memberships-stripe-integration.md)).
Poll `/my/membership` until `active` or `past_due`. Confirm downvote **counts**
are visible on a post
([feature limits](../../../docs/requirements/users/reference-memberships-feature-limits.md)).
Then cancel at period end. Entitlements remain through the paid period.

Do not run Stripe Identity or refunds. An optional decline card must not leave
`incomplete` blocking the success path.

Plus unblocks `account_too_new` / just_joined create cells
([contribution gating](../../../docs/requirements/users/reference-memberships-contribution-gating-anti-bot.md)).
If create is gated, finish Stripe before those cells. Admin is never gated.

## AWS logs and Sentry

Before walking flows, and after any 5xx, blank shell, unexpected toast, or
failed write, follow
[Deployed Error Investigation](../../../docs/operations/deployed-error-investigation.md).
That runbook owns alarm names, log groups, Logs Insights queries, DLQ sampling,
and Sentry fallback when MCP is expired.

Mid-QA correlation is still `x-request-id` / JSON `request_id`
([error handling](../../../docs/overview/architecture/error-handling.md)).
Do not dump unbounded log pages into the session.

If a user-visible 5xx or silent failure has **no** matching CloudWatch line and
**no** Sentry event, that is a missing log. Do not edit backend or web mid-QA.
File it via [github-issue](../github-issue/SKILL.md), or open a follow-up
branch and PR after the run. The owning service should add it through backend
`onError`, web `onError`, or the existing structured logger. Do not invent a
second logging stack. Expected 4xx stays suppressed per the error-handling
contract.

## Issues

File only independently verified ❌ product bugs through
[github-issue](../github-issue/SKILL.md). Search first. When there are several,
preflight the manifest once, then authorize and create each issue separately. Do
not file skipped persona cells, empty-data, or 📄 unless
the mismatch is itself a docs bug.

## Staging database reset

Vouchington does not expose a staging reset workflow. Use the private infrastructure staging
database reset runbook (the "Staging database reset" step of the first-deploy checklist in the
private `vouchington-infra` repository), which requires organization access.
The manual procedure resets only the PostgreSQL `public` schema; it retains Valkey, queues, object
storage, analytics warehouse/event data, and infrastructure state. Wait for exact service-count
restoration and `/infra/ping` `200`/`pong` evidence before QA. Because Valkey session state is
retained while database users are removed, start with a fresh authenticated browser context after a
reset. Never replace the private workflow with ad hoc AWS or SQL commands.

## Grok workflow

Optional orchestrator: `.grok/workflows/staging-qa.rhai`. Prompts must tell
child agents to read this skill and the named matrix file. Do not paste those
tables into the script.

```text
/workflow staging-qa email=jong@voucha.ai scope=full
```

## See Also

- [chrome-qa](../chrome-qa/SKILL.md) — local stack only
- [user-flows](../../../docs/requirements/user-flows/README.md)
- [AUTH.md](../../../docs/requirements/security/AUTH.md)
- [staging Basic Auth](../../../docs/operations/cloudflare-worker-staging-auth.md)
- [staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md)
- [Deployed Error Investigation](../../../docs/operations/deployed-error-investigation.md)
