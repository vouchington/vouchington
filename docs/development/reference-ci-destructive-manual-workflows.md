# Destructive Manual Workflows

[Back to CI Reference](ci.md#destructive-manual-workflows)

Manual workflows that mutate infrastructure, deployed services, production-like data, or shared
cloud state need a focused safety review before the first push. Apply this checklist to destructive
`workflow_dispatch` workflows such as database resets, production promote/rollback, state unlocks,
and forced infrastructure recovery.

- Require typed confirmation for irreversible or high-blast-radius actions. The expected phrase
  should name the exact target and action, and the workflow should not expose a free-form
  environment selector when only one environment is valid.
- Hard-bind the workflow to its target environment in YAML and runtime guards. Use the matching
  GitHub environment gate, staging/production resource names, and in-script environment checks before
  running destructive SQL, service updates, or infrastructure mutations.
- When a destructive workflow runs SQL through `@data-stores/psql` outside tests, every direct query
  still needs the leading `/* queryName */` annotation required by the production query client.
- Serialize shared mutations with every workflow that touches the same state. Reuse an existing
  concurrency group when two workflows can race on the same database, ECS service, OpenTofu state, or
  deployment lifecycle, and keep `cancel-in-progress: false` when cancellation could strand state.
- Capture original service or resource state before mutation, scale down or pause dependent services
  before changing shared state, and restore only from the captured values. Restore steps should run on
  skipped resets and cleanly stopped reset tasks, but must not blindly restore while an unfinished
  destructive task may still be running.
- For staging ECS resets, discover the live backend and `voucha-worker-*-staging` services before
  scaling. Skip the reset if the backend or an active policy worker is absent, but include stale worker
  services in capture and restore so a retired deployment cannot keep database connections open.
- Add cleanup traps around launched tasks and partial mutations. Cleanup should stop unfinished work,
  wait for stop completion, print diagnostics, and fail closed when cleanup cannot prove the task is
  stopped.
- Prefer custom bounded polling over AWS waiters when the waiter cap is longer than the step budget or
  hides useful intermediate state. Polling loops should print the last observed status on timeout.
- Print CloudWatch or provider logs on both success and cleanup/failure paths so a completed destructive
  run is auditable without rerunning the workflow.
- When the workflow needs more than one or two shell functions, extract a typed task driver under
  `ci/` or the owning runtime workspace (for example, `backend/`) and keep YAML responsible for
  orchestration, permissions, inputs, and step wiring.
- Cover lifecycle invariants with workflow tests. Tests should select named steps, inspect `if:`
  expressions, and assert critical shell snippets in order instead of relying only on whole-file string
  containment.
