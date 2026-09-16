# Self-Hosted Runner Change Checklist

[Back to Workflow Authoring Reference](AUTHORING.md#self-hosted-runner-change-checklist)

When moving work onto self-hosted runners or changing their setup order:

- Verify the runner label against `runner-policy.test.mts`'s closed GitHub-hosted allowlist (`ubuntu-slim`, `ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`); failure output reports `workflow.yml#job` paths.
- Run `actions/checkout` before local composite actions, then run `./.github/actions/clean-workspace` before executing repo code.
- Jobs that hold OIDC or other trusted credentials and intentionally check out trusted code should clear inherited `BASH_ENV` before checkout when they run on persistent self-hosted runners.
- Avoid cache steps whose only value is package or build-directory persistence already provided by the runner workspace; preserve local `node_modules` and installed binaries through cleanup/version checks instead of using npm package caches.
- If a host package-manager install is unavoidable, use the shared `with-host-package-manager-lock` action documented in `RUNNERS.md` and document why the dependency cannot live in a container or ephemeral runner.
