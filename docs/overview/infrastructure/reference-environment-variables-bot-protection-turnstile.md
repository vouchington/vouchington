# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Bot Protection (Turnstile)

| Name                                            | Required in prod | Where          | Notes                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY`               | Staging/prod     | SM             | Server-side verification key. Local dev defaults to Cloudflare's public always-pass test secret.                                                                                                                                                                                     |
| `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`     | Staging/prod     | Runtime public | Site key for the browser widget. Local dev defaults to Cloudflare's public always-pass test site key.                                                                                                                                                                                |
| `SKIP_CAPTCHA_VERIFICATION`                     | Never            | Test           | Test/integration only — makes `verifyCaptchaToken` a no-op. `serve.mts` refuses to boot on a deployed environment (`ENVIRONMENT` is `staging` or `production`) when set.                                                                                                             |
| DynamicConfig `turnstile-config.always_approve` | Never            | Valkey         | Staging-only operator kill switch. When `true` and `ENVIRONMENT` is `staging`, `verifyCaptchaToken` no-ops. Production ignores it. Not an env var; toggle via `/admin/dynamic-config`. See [staging Turnstile always-approve](../../operations/staging-turnstile-always-approve.md). |

Both must be set to a real key in deployed staging/production. When unset (or whitespace-only) in
local dev, the backend and web fall back to Cloudflare's public always-pass test keys (`1x...`).
For production builds, both are enforced at distinct points:

- `CLOUDFLARE_TURNSTILE_SECRET_KEY` — runtime check in `backend/entrypoints/api/boot-guards.mts`
  (called from `serve.mts`) exits non-zero on a deployed environment (`ENVIRONMENT` is `staging` or
  `production`, via `@ts-shared/deploy-environment`'s `isDeployedEnvironment()`) when the env var is
  unset, blank, or equals the public test secret.
- `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` — runtime check in
  `web/lib/runtime-public-config-server.ts` throws when `ENVIRONMENT` is `staging` or `production`
  and the site key is unset, blank, or equals a public test key without
  `ALLOW_TURNSTILE_TEST_KEY=true`. This preserves the fail-closed behavior while allowing one web
  image to be promoted across environments.

See [deployment.md](deployment.md#cloudflare-turnstile-captcha) for details.
