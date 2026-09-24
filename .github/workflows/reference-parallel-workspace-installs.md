# Workspace Installs

[Back to Workflow Authoring Reference](AUTHORING.md#parallel-workspace-installs)

`setup-node-pnpm` owns dependency installation: one full `pnpm install --frozen-lockfile` against the
restored pnpm store cache, after activating Node and pnpm (see [Composite Actions](ACTIONS.md)).
`setup-backend` wraps it. Every runner is fresh and ephemeral, so there are no lifecycle, filter, or
reconciliation inputs.

Do not add direct `pnpm install` steps to a workflow or another composite action. Every install
mutates the shared root `node_modules` and pnpm metadata, so dependency setup has one owner per job;
`pnpm-install-policy.test.mts` enforces it.

Control-plane-only jobs may skip dependency lifecycle scripts (`--ignore-scripts`):

```yaml
- uses: ./.github/actions/setup-node-pnpm
  timeout-minutes: 5
  with:
    install-scripts: 'false'
```

Use that mode only when every later Node command's dependency graph needs no install-time build and
no workspace package produces an artifact during installation. It removes unrelated native downloads
and other lifecycle hooks from the job's availability boundary. `pnpm-install-policy.test.mts` owns
the exact caller allowlist.

Before the first commit that changes a caller, set the action step's timeout from
[Step Timeouts](reference-step-timeouts.md) and run
`pnpm exec vitest run --project github-actions`.
