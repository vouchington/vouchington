# Miniflare Cache

[Back to Dev Environment Reference](README.md#miniflare-cache)

Miniflare and Wrangler runtime files for repo-owned launchers live under
`cloudflare-worker/.wrangler/runtime/`; older local state may still exist in
`cloudflare-worker/.wrangler/state/`. Next.js writes runtime output to
`web/.next/`. Stale cached HTML or stale runtime output can cause false
failures, including React hydration failures.

**Symptom:** `__next_f.push` is overridden but no `__reactFiber` on any DOM element, and `x-voucha-cache: HIT` in response headers.

**Fix:** re-run `./dev/initialize web` (which clears `cloudflare-worker/.wrangler/state/`, `cloudflare-worker/.wrangler/runtime/`, and `web/.next/`), then restart services with `./dev/tmux`. Playwright and CI also clear these runtime caches before starting their own servers.
