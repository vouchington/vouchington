# CI/CD workflows

- Follow the [validation checklist](../../docs/checklists/github-actions.md#checklist).
- Never grant `actions: write` to a job that runs checked-out code; merge-group `cancel-<job>` jobs
  stay checkout-free.
