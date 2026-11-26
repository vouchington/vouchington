# Destructive Manual Workflows

[Back to CI Reference](ci.md#destructive-manual-workflows)

Generic safety rules for destructive `workflow_dispatch` workflows (typed confirmation, hard-bound
environment, serialization, capture and restore, cleanup traps, bounded polling) live in the
`github-actions-authoring` skill. These are the Voucha-specific facts.

- When a destructive workflow runs SQL through `@data-stores/psql` outside tests, every direct query
  still needs the leading `/* queryName */` annotation required by the production query client.
- For staging ECS resets, discover the live backend and `voucha-worker-*-staging` services before
  scaling. Skip the reset if the backend or an active policy worker is absent, but include stale worker
  services in capture and restore so a retired deployment cannot keep database connections open.
- When the workflow needs more than one or two shell functions, extract a typed task driver under
  `ci/` or the owning runtime workspace (for example, `backend/`) and keep YAML responsible for
  orchestration, permissions, inputs, and step wiring.
- Cover lifecycle invariants with workflow tests that select named steps, inspect `if:`
  expressions, and assert critical shell snippets in order.
