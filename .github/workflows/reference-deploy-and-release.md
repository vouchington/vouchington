# Deploy And Release

[Back to Workflow Reference](WORKFLOWS.md#deploy-and-release)

| Workflow                                                   | Type       | Runner          | Docker | Purpose                                                                                                                         |
| ---------------------------------------------------------- | ---------- | --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [Publish Backend Images](publish-backend-images.yml)       | Reusable   | Mixed           | Yes    | Validates backend images on PRs, publishes them from merge groups, and verifies or fills authenticated missing targets on main. |
| [Publish Web Images](publish-web-images.yml)               | Reusable   | Mixed           | Yes    | Validates the web image on PRs, publishes it from merge groups, and verifies or fills an authenticated missing target on main.  |
| [Dispatch Completed Deploy](dispatch-completed-deploy.yml) | Standalone | `ubuntu-slim`   | No     | Dispatches trusted successful source metadata to route-specific `vouchington-infra` receivers.                                  |
| [Sync Articles](sync-articles.yml)                         | Standalone | `ubuntu-slim`   | No     | Packages an immutable article artifact for private infrastructure dispatch.                                                     |
| [Docs Publish](docs-publish.yml)                           | Standalone | `ubuntu-latest` | No     | Builds an immutable OpenAPI, MCP-catalog, and PostgreSQL-schema documentation artifact for private infrastructure dispatch.     |

Vouchington validates source, publishes product-owned runtime artifacts, and dispatches its
revision asynchronously. `vouchington-infra` owns artifact materialization and every deployment
mutation. A successful dispatch is not deployment evidence, so operators must verify the matching
private receiver run. See the
[deployment CI/CD reference](../../docs/overview/infrastructure/reference-deployment-ci-cd-flow.md#operations-and-failure-handling).

Trusted web image publication does not require `SENTRY_AUTH_TOKEN`. When that repository secret is
present, the build creates a Sentry release and uploads source maps; otherwise it publishes the
validated image without source maps. The image build, smoke test, and Trivy gate run in either case.

The backend and web publish workflows read each `docker push` digest and attest that exact
`ghcr.io/vouchington/<image>@<digest>` subject with `actions/attest@v4` after the smoke and Trivy
gates. The attestation signer workflow is the reusable publish workflow itself, so the receiver
checks the corresponding `.github/workflows/publish-*-images.yml` identity and the `main` source
revision. Their build jobs inherit explicit read-only PR or write-enabled merge-group/main caller
permissions; resolver and final verification jobs declare only read scopes. Publication disables
linked artifact storage records. The private
`vouchington-infra` receiver must verify the attestation before copying the digest to ECR; a tag or
an unattested digest is not a deployable artifact. The backend attests `api` and `worker-cpu` on every
run and `worker-io` when the checked-in automation flag enables that image.

Vouchington has no production application-deployment workflow. The global CI apply workflow and its
trust remain disabled; operator-controlled global applies use `vouchington-infra`'s separately
authorized exact saved-plan procedure.
