# Host Locks

Voucha CI runs on GitHub-hosted, ephemeral runners. Repository workflows and
scripts therefore do not use host-lock wrappers, shared host-pressure
diagnostics, or runner-local port allocation policies: every job receives an
isolated VM and coordinates only the processes it starts in that job.

For a job that needs a host port, prefer Docker's ephemeral host-port mapping.
The small number of in-job browser consumers that must reserve a port use
[`ci/allocate-browser-safe-ports.py`](../../ci/allocate-browser-safe-ports.py)
immediately before binding it; this does not coordinate work across jobs.

Runner selection, per-job caches, concurrency, and timeouts are documented in
[CI](ci.md) and [the GitHub Actions checklist](../checklists/github-actions.md).
