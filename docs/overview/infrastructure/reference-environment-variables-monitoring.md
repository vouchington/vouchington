# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Monitoring

| Name                        | Required | Where          | Notes                                                                                                              |
| --------------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `SENTRY_DSN`                | No       | Lambda         | Shared Lambda Sentry DSN override. Lambdas fall back to the existing Voucha Sentry project DSN when unset or blank |
| `SENTRY_TRACES_SAMPLE_RATE` | No       | Lambda         | Shared Lambda trace sample rate override from `0` to `1`. Lambdas fall back to `1.0` when unset, blank, or invalid |
| `NEXT_PUBLIC_GTM_ID`        | No       | Runtime public | Google Tag Manager container ID                                                                                    |
| `GRAFANA_IRM_HEARTBEAT_URL` | No       | Worker-cpu     | Secret Grafana IRM heartbeat endpoint injected by infrastructure; worker-cpu posts every 60 minutes when set       |
