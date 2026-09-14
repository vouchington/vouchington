# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Monitoring

| Name                             | Required           | Where                   | Notes                                                                                                                                                                                         |
| -------------------------------- | ------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_DSN`                     | Yes (deployed)     | Runtime environment     | Public Sentry identifier for backend, workers, web server/edge, and Lambdas. Configure as a plain environment value; a deployed runtime disables Sentry when it is unset or invalid           |
| `SENTRY_WEB_DSN`                 | Yes (deployed)     | Runtime public / Worker | Public browser Sentry identifier published through runtime public config and trusted by the Worker tunnel                                                                                     |
| `SENTRY_TUNNEL_PREVIOUS_WEB_DSN` | No (rotation only) | Worker                  | Retiring public browser Sentry identifier. With a valid `SENTRY_WEB_DSN` replacement, the tunnel and web CSP accept both values until this temporary binding is removed after browser rollout |
| `SENTRY_TRACES_SAMPLE_RATE`      | No                 | Lambda                  | Shared Lambda trace sample rate override from `0` to `1`. Lambdas fall back to `1.0` when unset, blank, or invalid                                                                            |
| `NEXT_PUBLIC_GTM_ID`             | No                 | Runtime public          | Google Tag Manager container ID                                                                                                                                                               |
| `GRAFANA_IRM_HEARTBEAT_URL`      | No                 | Worker-cpu              | Secret Grafana IRM heartbeat endpoint injected by infrastructure; worker-cpu posts every 60 minutes when set                                                                                  |
