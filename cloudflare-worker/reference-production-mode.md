# Production Mode

[Back to Cloudflare Worker](README.md#production-mode)

Set `PRODUCTION=true` for production deployments and `PRODUCTION=false` for staging, local
development, and CI. Ambiguous non-empty values such as `1`, `yes`, or `on` are logged as
configuration errors and fail closed to production mode so HSTS, strict JWT verification, and
related controls remain enabled until the binding is corrected.

Sentry reporting is gated separately, by `ENVIRONMENT` rather than `PRODUCTION` — see
[reference-sentry-error-monitoring.md](reference-sentry-error-monitoring.md). Staging is a deployed
environment and reports to Sentry even though `PRODUCTION=false` there.
