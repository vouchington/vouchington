# Deploy And Release

[Back to Workflow Reference](WORKFLOWS.md#deploy-and-release)

| Workflow                                                   | Type       | Runner                                            | Docker | Purpose                                                                                        |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| [Build Backend](build-backend.yml)                         | Reusable   | `ubicloud-standard-8-arm` or opt-in AWS CodeBuild | Yes    | Validates backend images for pull requests without publishing them.                            |
| [Build Web](build-web.yml)                                 | Reusable   | `ubicloud-standard-4-arm` or opt-in AWS CodeBuild | Yes    | Validates web images for pull requests without publishing them.                                |
| [Dispatch Completed Deploy](dispatch-completed-deploy.yml) | Standalone | `[self-hosted]`                                   | No     | Dispatches trusted successful source metadata to route-specific `vouchington-infra` receivers. |
| [Sync Articles](sync-articles.yml)                         | Standalone | —                                                 | No     | Produces a source workflow completion for private infrastructure dispatch.                     |
| [Docs Publish](docs-publish.yml)                           | Standalone | —                                                 | No     | Produces a source workflow completion for private infrastructure dispatch.                     |

Filaments validates source and dispatches its revision asynchronously. `vouchington-infra` owns
artifact publication and every deployment mutation. A successful dispatch is not deployment
evidence, so operators must verify the matching private receiver run. See the
[deployment CI/CD reference](../../docs/overview/infrastructure/reference-deployment-ci-cd-flow.md#operations-and-failure-handling).

Filaments has no production application-deployment workflow. The global CI apply workflow and its
trust remain disabled; operator-controlled global applies use `vouchington-infra`'s separately
authorized exact saved-plan procedure.
