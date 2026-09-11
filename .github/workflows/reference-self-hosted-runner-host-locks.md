# Self-Hosted Runner Host Locks

[Back to Workflow Runners](RUNNERS.md#self-hosted-runner-host-locks)

Self-hosted jobs sharing an OS user also share UID-scoped named locks under `/tmp`, independent of
runner-specific `TMPDIR` and `HOME` values. The generic primitive, nested-lock rejection, stale
recovery, root selection, and complete coverage matrix are documented in
[Per-User Host Locks](../../docs/development/host-locks.md).

- Type-aware oxlint is the only `memory-heavy` consumer and uses one best-effort slot. Ordinary
  Vitest, Playwright, Storybook, and native test runners do not acquire this lock.
- Expensive Next and Storybook compiler work uses the `expensive-build` family through canonical
  repository entry points. Each command path has one owner; wrappers and actions must not add a
  second lock. Native-client lock ownership is documented in
  [vouchington-clients](https://github.com/vouchington/vouchington-clients).
- Host package state mutations use the `host-package-manager` family through the shared
  `with-host-package-manager-lock` composite action. Keep related operations in one critical
  section and hold the lock as the runner user before running any required `sudo` commands.
- Scheduling-lock waits still occupy runners. In GitHub Actions, oxlint and most expensive builds
  wait at most 60 seconds before running unlocked. Host-side Next builds wait up to 300 seconds and
  fail closed so lock contention cannot create overlapping compilers; local acquisition remains
  fail-closed.
- Different OS users and containers do not coordinate through this per-user namespace.
  Host package-manager example:

```yaml
- name: Install PostgreSQL client
  uses: ./.github/actions/with-host-package-manager-lock
  with:
    command: |
      sudo apt-get update
      sudo apt-get install -y --no-install-recommends postgresql-client
```
