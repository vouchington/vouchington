---
name: chrome-qa
description: |
  Live browser QA of the Voucha local stack with persona switching. Use when walking
  user flows from docs/requirements/user-flows/ across different roles (Anon, RU, CM,
  CO, SM, QA, SA) or verifying UI behavior that Playwright specs don't cover.
user-invocable: true
---

# Chrome QA

Use this skill to walk key user flows in a live browser against the local Voucha stack.
It complements [local-site-testing](../local-site-testing/SKILL.md), which covers stack
startup — read that skill first if services are not already running.

## Prerequisites

The full stack must be running and `.env` must be sourced. If not yet started, see
[local-site-testing](../local-site-testing/SKILL.md) for initialization and service startup.

Stack entry point (the only supported browser URL — protocol depends on whether mkcert
certs are present):

```
https://localhost:$WORKER_PORT   # when both dev/certs/localhost.pem and localhost-key.pem exist (default)
http://localhost:$WORKER_PORT    # when mkcert certs are absent
```

`pnpm run login-as` and `pnpm run seed-source` detect the same two-cert presence and print
the correct protocol in their output. Direct Next.js URLs bypass edge auth — do not use them for QA.

## Persona Login via OTP Deep-Link

```bash
pnpm run login-as -- <email>              # regular user
pnpm run login-as -- <email> --role moderator  # site moderator
pnpm run login-as -- qa-developer@voucha.ai --role developer  # developer QA
pnpm run login-as -- --all                # prints links for all standard personas
```

This mints an OTP deep-link (e.g. `https://localhost:$WORKER_PORT/login?emailAddress=…&otp=…`).
Load that URL in claude-in-chrome — the verify step **auto-submits once** when the tab is
focused and visible. No click needed; no CAPTCHA on the verify step.

**Persona switching:** `/login` redirects users who already have an active session. Before
loading the next persona's deep-link, sign out via the account menu in the app, then
navigate to the new deep-link in the same tab. Alternatively, open the deep-link in a
fresh incognito window that has no cookies.

**DNS note:** brand-new persona emails (never logged in before) require a real-MX domain
(e.g. `@voucha.ai`) and network access — run the command with sandbox disabled the first
time. Once `logged_in_at` is set the persona is DNS-free on re-runs. The seeded admin
(`tests@voucha.ai`, id `00000000-0000-0000-0000-000000000000`) is always DNS-free.

## Starting claude-in-chrome

```
1. mcp__claude-in-chrome__tabs_context_mcp   — inspect existing tabs
2. mcp__claude-in-chrome__tabs_create_mcp    — open a new tab
3. mcp__claude-in-chrome__navigate           — load the OTP URL or app page
4. mcp__claude-in-chrome__read_page          — read current page state
```

Do not reuse tab IDs from a prior session.

## What to Walk

Use the flow matrices in [docs/requirements/user-flows/](../../../docs/requirements/user-flows/)
to pick flows. For each matrix cell record:

| Symbol | Meaning                           |
| ------ | --------------------------------- |
| ✅     | Works as specified                |
| ❌     | Broken                            |
| ⚠️     | Rough edge / unexpected behaviour |
| 📄     | Doc mismatch (spec vs. actual)    |

Walk flows for each relevant persona. Persona coverage collapses by entity:

- **Sources & Topics** — Anon / RU / SA (SM has no elevated powers here)
- **Posts** — Anon / RU / CM or CO / SA (moderation is genuinely tiered)

## Seeding Test Data

```bash
pnpm run db:seed      # sources, topics, articles from seed/*.csv
pnpm run seed-source  # deterministic seeded source — no crawl workers or network needed
```

The seeded source appears at `/sources`.

## Local Setup Notes

- **Stack entry**: `https://localhost:$WORKER_PORT` only
- **Seeded admin**: `tests@voucha.ai` — role `administrator`, always DNS-free
- **Developer QA**: `qa-developer@voucha.ai` — role `developer`, included by `--all`
- **Source submit + crawl**: requires IO/CPU workers; use `pnpm run seed-source` for
  deterministic local data without running crawl workers

## See Also

- [Flow matrices](../../../docs/requirements/user-flows/README.md) — Sources, Topics, Posts
- [local-site-testing](../local-site-testing/SKILL.md) — stack initialization and startup
- [staging-qa](../staging-qa/SKILL.md) — `https://staging.voucha.ai` only; never use chrome-qa against
  staging. Staging Turnstile MCP skip is
  [staging Turnstile always-approve](../../../docs/operations/staging-turnstile-always-approve.md).
