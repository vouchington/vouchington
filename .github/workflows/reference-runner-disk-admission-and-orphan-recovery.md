# Self-Hosted Runner Disk Admission And Orphan Recovery

[Back to Workflow Runners](RUNNERS.md#codex-runner-disk-admission-and-orphan-recovery)

Host installation, runner registration, health hooks, disk cleanup, launchd services, and orphan
recovery are owned by
[vouchington-machines](https://github.com/vouchington/vouchington-machines).
Voucha owns only the workflow-side contract consumed from those hosts.

## Voucha consumer contract

Every protected self-hosted registration must run the trusted host hook before repository checkout.
When capacity is unavailable, that hook emits this exact diagnostic:

```text
Runner disk admission rejected: free=<n>GiB required=<m>GiB active_leases=<k>
```

The log also names the installed `voucha-actions-runner-health/job-started.sh` path, currently
behind a versioned/symlinked `current/` directory (observed:
`voucha-actions-runner-health/current/job-started.sh`). The
[transient retry classifier](../../ci/transient-retry/runner-disk-admission-rules.mts) matches that
path with a pattern tolerant of one interposed directory segment, so it keeps classifying across a
host-side rename of that directory; accepts the failure only when the hook rejection occurs before
`actions/checkout`, `free < required`, and every genuine failed leaf has the same host-capacity
cause. It reruns once; repeated rejection requires host investigation. Keep the diagnostic text,
hook path, and the classifier fixtures synchronized with the host repository — if the host repo
ever nests the hook more than one directory deep, widen the classifier's path pattern to match.

Host configuration continues to expose the established `VOUCHA_*` runner-health environment keys,
including `VOUCHA_RUNNER_DISK_PROFILE`. Workflows own runner labels, capacity demand, checkout-time
workspace trust cleanup, host locks, and transient retry policy; those remain in this repository.

## Rollout gate

Host-tool changes must be dry-run capable, no-op when inputs are unchanged, and fail before mutation
when any affected runner is busy or any active lease exists. Target-repository CI must cover those
behaviors, the installed hook's lease lifecycle, and the exact pre-checkout admission diagnostic
above before a Voucha change removes or alters the consumed host contract.
