# Captcha Config API

Public staging-only Turnstile always-approve signal for MCP QA clients.

## Endpoints

| Method | Route                    | Authentication | Description                                                |
| ------ | ------------------------ | -------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/captcha-config` | None           | Whether Turnstile verification is currently always-approve |

## GET /api/v1/captcha-config

Returns `{ "always_approve": boolean }`. The value is `true` only when `ENVIRONMENT` is `staging`
and DynamicConfig `turnstile-config.always_approve` is boolean `true`. Production always returns
`false`.

`Cache-Control: private, no-store` so CachedOrigin and CDNs do not retain a skip-on snapshot.

## Performance

| Endpoint                   | Round Trips | Caching                   | Notes                                 |
| -------------------------- | ----------- | ------------------------- | ------------------------------------- |
| GET /api/v1/captcha-config | 0           | HTTP: `private, no-store` | Reads in-memory DynamicConfig; no I/O |

## Related

- Service: [../../../services/captcha/README.md](../../../services/captcha/README.md)
- Operations: [../../../../docs/operations/staging-turnstile-always-approve.md](../../../../docs/operations/staging-turnstile-always-approve.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
