# Docker Image Path Filters

[Back to Workflow Authoring Reference](AUTHORING.md#docker-image-path-filters)

- On trusted pull requests, `build-backend-infra` and `build-web-infra` are positive-only primary
  filters. They cover Docker configuration, `pnpm-workspace.yaml`, and only the
  per-workspace manifests copied by the corresponding Dockerfile that scope _that_ image. Backend
  also covers both deployed dependency packaging helpers.
- The root `package.json` and monorepo-wide `pnpm-lock.yaml` deliberately fail open to both PR image
  builds. They are coarse signals, but a transitive-only dependency update can change either image
  without touching an in-subgraph manifest. Both images therefore receive pre-merge build, smoke,
  and scan validation at the root dependency boundary.
- On pull requests, workflow and local-action callers are selected by revision-aware topology,
  rather than broad Docker filters. The refined `build-backend` and `build-web` filters are the
  shared publication-intent owner for merge groups and main: they include root dependency inputs
  and production image-promotion helpers while excluding test, fixture, Markdown, and Storybook
  changes. The merge-group workflow retains its `workflow-action-changes` fail-open validation;
  only the shared filter can request a main fallback and deployment intent.
- Apart from the intentional root dependency fail-open, do not trigger PR Docker image builds for
  unrelated actions or workspace manifests. Within the backend and web area workflows, keep PR Docker filters and the refined
  broad filters from matching Markdown-only, test-only, test-helper-only, or Storybook-only changes.
  Keep `.dockerignore` aligned so ignored files are not sent to the shared repo-root Docker context.
