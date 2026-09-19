# Lambdas

AWS Lambda source packages validated by Vouchington alongside the Voucha backend. Each Lambda is a
separate workspace package with its own `handler.mts` entrypoint. Vouchington dispatches the validated
source revision to `vouchington/vouchington-infra`. The successful `main-lambdas` run publishes the
attempt-bound image-resize ZIP that infrastructure verifies and copies into its durable deployment
store; infrastructure continues to own deployment and topology.

## Inventory

| Path                               | Purpose                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`image-resize/`](image-resize/)   | On-demand image resize / format conversion in front of S3. See [`image-resize/CLAUDE.md`](image-resize/CLAUDE.md). |
| [`shared/`](shared/)               | Cross-lambda helpers (Sentry init, etc.).                                                                          |
| [`dev-server.mts`](dev-server.mts) | Local HTTP harness that hosts each lambda's handler for development.                                               |

## Related

- Backend rules: [`../backend/CLAUDE.md`](../backend/CLAUDE.md)
- Infrastructure overview: [`../docs/overview/infrastructure/infrastructure.md`](../docs/overview/infrastructure/infrastructure.md)
- Deployment and infrastructure: `vouchington/vouchington-infra`
- Root entrypoint: [`../CLAUDE.md`](../CLAUDE.md)
