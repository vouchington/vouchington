# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Server Configuration

| Name                               | Required | Where        | Notes                                                                                                                                                                                                                                                            |
| ---------------------------------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRACEFUL_SHUTDOWN_PERIOD_SECONDS` | No       | ECS          | Shutdown grace period (default: 10)                                                                                                                                                                                                                              |
| `HTTP_CACHE_SHORT_MAX_AGE_SECONDS` | No       | ECS          | Short cache TTL (default: 60)                                                                                                                                                                                                                                    |
| `HTTP_CACHE_LONG_MAX_AGE_SECONDS`  | No       | ECS          | Long cache TTL (default: 300)                                                                                                                                                                                                                                    |
| `SITEMAP_BASE_URL`                 | No       | ECS          | Base URL for sitemaps (default: `https://voucha.ai`)                                                                                                                                                                                                             |
| `VOUCHA_WEB_BASE_URL`              | No       | Local/native | Web origin used by native browser auth callbacks. Native clients fall back to `SITEMAP_BASE_URL` and then local dev defaults when unset.                                                                                                                         |
| `IMAGE_ORIGIN`                     | Yes      | ECS          | Canonical image CDN origin for web SSR/client hydration, backend API responses, and backend workers — `https://images-staging.voucha.ai` (staging) / `https://images.voucha.ai` (production). Wired through `ecs-web.tf`, `ecs-backend.tf`, and `ecs-worker.tf`. |
| `API_BASE_URL`                     | Yes      | ECS          | Backend origin used by the Next.js server. In ECS: `http://backend:2900` (Service Connect internal endpoint, `local.backend_internal_url`). In local dev: `http://localhost:2900`. Set in `ecs-web.tf`.                                                          |

## Related

- [docs/overview/architecture/ai-agents.md](../architecture/ai-agents.md)
- [docs/overview/architecture/auth-overview.md](../architecture/auth-overview.md)
- [docs/development/local-env-vars.md](../../development/local-env-vars.md)
- [backend/CLAUDE.md](../../../backend/CLAUDE.md)
