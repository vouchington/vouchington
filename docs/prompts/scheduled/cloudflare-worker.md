Review the Cloudflare Worker. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check routing, caching, CSP/security headers, Sentry tunnel, rate limiting, sitemap serving, basic auth, and proxy/session handling, staying compatible with the backend and web contracts.
- Prefer reducing origin load, tightening security, or simplifying Worker logic; validate with Worker tests, smoke test, typecheck, or guard.
