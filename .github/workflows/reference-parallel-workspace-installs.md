# Workspace Installs

[Back to Workflow Authoring Reference](AUTHORING.md#parallel-workspace-installs)

Do not add direct `pnpm install` steps beside `setup-node-pnpm` or `setup-backend`. Every install
mutates the shared root `node_modules` and pnpm metadata, so dependency setup has one owner per job.

Persistent runners preserve `node_modules` and must declare the lifecycle explicitly:

```yaml
- uses: ./.github/actions/setup-node-pnpm
  with:
    runner-lifecycle: persistent
```

Control-plane-only jobs may also disable dependency lifecycle scripts explicitly:

```yaml
- uses: ./.github/actions/setup-node-pnpm
  with:
    runner-lifecycle: persistent
    install-scripts: 'false'
```

Use that mode only when every later Node command's dependency graph needs no install-time build and
no workspace package produces an artifact during installation. It removes unrelated native downloads and other lifecycle hooks from
the job's availability boundary. `pnpm-install-policy.test.mts` owns the exact caller allowlist.

The action fingerprints the dependency graph, pnpm policy, install-script mode, and host runtime.
When that provenance matches the last successful reconciliation, it runs one full, ordinary frozen
install and verifies declared first-party workspace links. On a populated tree, missing or changed
provenance, or a link that is missing, broken, or points at the wrong workspace, triggers forced
script-free plus strict reconciliation. An entirely absent `node_modules` has nothing to reconcile,
so it takes one ordinary install and stamps directly, falling back to the same forced reconciliation
only if that install still leaves an invalid link. The successful reconciliation (or cold install)
stamp lives under the preserved root `node_modules`.

Ephemeral runners may retain a narrow dependency closure, but selectors are values rather than raw
`--filter` arguments:

```yaml
- uses: ./.github/actions/setup-node-pnpm
  with:
    runner-lifecycle: ephemeral
    install-scripts: 'false'
    ephemeral-workspaces: |
      ./ci...
      {./lambdas/image-resize}...
```

The action rejects empty, negative, and flag-shaped selectors and passes `--fail-if-no-match`.
Include every owned tool boundary explicitly, including `./ci...` when later commands use CI
tooling. Use dependency-closure selectors (`...`) rather than listing transitive packages manually.

Before the first commit that changes a caller, set the action step's timeout from
[Step Timeouts](reference-step-timeouts.md), confirm every later `pnpm exec` binary is declared by
the selected workspace rather than supplied only by a transitive dependency (Knip owns dependency
declarations), update the typed profile in `pnpm-install-policy.test.mts`, and run
`pnpm exec vitest run --project github-actions`.
