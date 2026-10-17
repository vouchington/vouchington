# Deploy And Release

| Workflow                                                                                 | Type       | Runner          | Docker | Purpose                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [Publish Backend Images](../../../../.github/workflows/publish-backend-images.yml)       | Reusable   | Mixed           | Yes    | Validates backend images on PRs, publishes them from merge groups, and verifies or fills authenticated missing targets on main. |
| [Publish Web Images](../../../../.github/workflows/publish-web-images.yml)               | Reusable   | Mixed           | Yes    | Validates the web image on PRs, publishes it from merge groups, and verifies or fills an authenticated missing target on main.  |
| [Dispatch Completed Deploy](../../../../.github/workflows/dispatch-completed-deploy.yml) | Standalone | `ubuntu-slim`   | No     | Dispatches trusted successful source metadata to route-specific `vouchington-infra` receivers.                                  |
| [Sync Articles](../../../../.github/workflows/sync-articles.yml)                         | Standalone | `ubuntu-slim`   | No     | Packages an immutable article artifact for private infrastructure dispatch.                                                     |
| [Docs Publish](../../../../.github/workflows/docs-publish.yml)                           | Standalone | `ubuntu-latest` | No     | Builds an immutable MCP-catalog and PostgreSQL-schema documentation artifact for private infrastructure dispatch.               |

Vouchington validates source, publishes product-owned runtime artifacts, and dispatches its
revision asynchronously. `vouchington-infra` owns artifact materialization and every deployment
mutation. A successful dispatch is not deployment evidence, so operators must verify the matching
private receiver run. See the
[deployment CI/CD reference](../../../overview/infrastructure/reference-deployment-ci-cd-flow.md#operations-and-failure-handling).

Trusted web image publication does not require `SENTRY_AUTH_TOKEN`. When that repository secret is
present, the build creates a Sentry release and uploads source maps; otherwise it publishes the
validated image without source maps. The image build, smoke test, and Trivy gate run in either case.

Published images are attested after the smoke and Trivy gates, and main reuses an image only when its
attestation verifies. The private receiver does not yet verify the attestation before copying.

Vouchington has no production application-deployment workflow. The global CI apply workflow and its
trust remain disabled; operator-controlled global applies use `vouchington-infra`'s separately
authorized exact saved-plan procedure.
