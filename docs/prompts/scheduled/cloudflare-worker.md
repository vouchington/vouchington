Review the Cloudflare Worker. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check routing, caching, CSP/security headers, Sentry tunnel behavior, rate limiting, sitemap serving, basic auth, and proxy/session handling.
- Keep edge behavior compatible with the backend and web app contracts.
- Prefer improvements that reduce origin load, tighten security, or simplify Worker logic.
- Validate with the relevant Worker unit tests, smoke test, typecheck, or static-analysis guard.
