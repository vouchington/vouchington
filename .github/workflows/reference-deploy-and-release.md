# Deploy And Release

[Back to Workflow Reference](WORKFLOWS.md#deploy-and-release)

| Workflow                                                   | Type       | Runner             | Docker | Purpose                                                                                                       |
| ---------------------------------------------------------- | ---------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------- |
| [Build Backend](build-backend.yml)                         | Reusable   | `ubuntu-24.04-arm` | Yes    | Validates backend images for pull requests without publishing them.                                           |
| [Build Web](build-web.yml)                                 | Reusable   | `ubuntu-24.04-arm` | Yes    | Validates web images for pull requests without publishing them.                                               |
| [Publish Backend Images](publish-backend-images.yml)       | Reusable   | `ubuntu-24.04-arm` | Yes    | Rebuilds and re-validates backend images on trusted main runs, then publishes them to GHCR.                   |
| [Publish Web Images](publish-web-images.yml)               | Reusable   | `ubuntu-24.04-arm` | Yes    | Rebuilds and re-validates the web image on trusted main runs, then publishes it to GHCR.                      |
| [Dispatch Completed Deploy](dispatch-completed-deploy.yml) | Standalone | `ubuntu-slim`      | No     | Dispatches trusted successful source metadata to route-specific `vouchington-infra` receivers.                |
| [Sync Articles](sync-articles.yml)                         | Standalone | `ubuntu-slim`      | No     | Packages an immutable article artifact for private infrastructure dispatch.                                   |
| [Docs Publish](docs-publish.yml)                           | Standalone | `ubuntu-latest`    | No     | Builds an immutable OpenAPI and PostgreSQL-schema documentation artifact for private infrastructure dispatch. |

Filaments validates source and dispatches its revision asynchronously. `vouchington-infra` owns
artifact publication and every deployment mutation. A successful dispatch is not deployment
evidence, so operators must verify the matching private receiver run. See the
[deployment CI/CD reference](../../docs/overview/infrastructure/reference-deployment-ci-cd-flow.md#operations-and-failure-handling).

Trusted web image publication does not require `SENTRY_AUTH_TOKEN`. When that repository secret is
present, the build creates a Sentry release and uploads source maps; otherwise it publishes the
validated image without source maps. The image build, smoke test, and Trivy gate run in either case.

Filaments has no production application-deployment workflow. The global CI apply workflow and its
trust remain disabled; operator-controlled global applies use `vouchington-infra`'s separately
authorized exact saved-plan procedure.
