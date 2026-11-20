# Shared TypeScript

- Shared packages are safe in Node and Cloudflare Workers unless explicitly Node-only; accept
  bindings/options instead of backend assumptions/globals.
- Auth/session key changes update backend and Worker docs/tests together.
- `utm` stays universal without Node APIs; `utils` stays pure formatting/trust-tier/URL logic
  without framework dependencies.
