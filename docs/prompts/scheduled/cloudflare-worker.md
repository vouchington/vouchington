Review the Cloudflare Worker. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check routing, caching, CSP/security headers, Sentry tunnel behavior, rate limiting, sitemap serving, basic auth, and proxy/session handling.
- Keep edge behavior compatible with the backend and web app contracts.
- When a runbook table or checklist is sourced from `cloudflare-worker/src/`, verify it against the current source before editing. In particular, keep the staging basic-auth exempt path table in `docs/operations/cloudflare-worker-staging-auth.md` synchronized with `BASIC_AUTH_EXEMPT_PATHS` in `cloudflare-worker/src/basic-auth.mts`.
- Prefer improvements that reduce origin load, tighten security, simplify Worker logic, or add narrow source/doc drift guardrails.
- Validate with the relevant Worker unit tests, smoke test, typecheck, or static-analysis guard.
