# Development

[Back to Cloudflare Worker](README.md#development)

- `pnpm run test:cloudflare-worker` — unit and mock tests
- `pnpm run test:smoke:cloudflare-worker` — build and HTTP smoke test
- `pnpm run typecheck:cloudflare-worker` — typecheck

Automation serves only the prebuilt bundle with `wrangler dev dist/index.js --no-bundle`. Live
`wrangler dev` is for the development loop and manual QA. See
[tests.md](../docs/development/tests.md#e2e-and-visual) for the full validation contract.
