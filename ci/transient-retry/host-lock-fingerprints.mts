// Shared vocabulary for the `with-host-lock:` marker family emitted by vouchington-tooling's
// scripts/host-lock/with-host-lock.sh. Both the expensive-build acquire-timeout rules
// (web-build-acquire-timeout-rules.mts) and the setup-playwright host-package-manager lock
// consumer (playwright-log-fingerprints.mts) key off this script's output, so they import from
// here instead of duplicating the echo-guard or marker text.

// Distinguish emitted runtime log lines from GitHub Actions echoed source for
// `run:` steps. Assumes this action emits timeout markers via `echo`; switch to
// a tag-based marker if that changes.
export function hasEmittedLogLine(log: string, text: string): boolean {
  return log.split('\n').some(line => {
    const index = line.indexOf(text)
    if (index === -1) return false
    return !/\becho\s+/.test(line.slice(0, index))
  })
}

// hostLockAcquireTimeoutMarker and hostLockRanUnlockedSuffix are each matched against two
// substrates: the packaged script's source (where `${timeout_seconds}` is unexpanded) and
// runtime log output (where it is expanded to e.g. `300s`). That only works because each
// constant sits entirely on one side of the interpolation — this one entirely before it. A
// reword that moves text across the interpolation boundary breaks both uses, not just one; keep
// this comment in sync with that constraint.
export const hostLockAcquireTimeoutMarker = 'lock not acquired within '

// See the interpolation-boundary note on hostLockAcquireTimeoutMarker above — this constant must
// stay entirely after the interpolated `${timeout_seconds}s`.
export const hostLockRanUnlockedSuffix = '; running unlocked'

// The post-drain fail-closed terminal path: after TERM and KILL both fail to drain the command
// process group, with-host-lock retains the lock so another compiler cannot overlap it, then exits
// 1 instead of remapping the earlier command timeout to 124.
export const hostLockProcessGroupSurvivedSigkillMarker =
  'process group survived SIGKILL; retaining lock ownership'

// The fail-closed acquisition-timeout path for the expensive-build family: with-host-lock.sh
// emits this line then exits 1. Excludes the benign run-unlocked variant, which shares the same
// prefix on the same source line but proceeds instead of failing (see #10994).
export function hasExpensiveBuildAcquireTimeout(log: string): boolean {
  const marker = `with-host-lock: expensive-build ${hostLockAcquireTimeoutMarker}`
  return log
    .split('\n')
    .some(
      line =>
        line.includes(marker) &&
        !line.includes(hostLockRanUnlockedSuffix) &&
        hasEmittedLogLine(line, marker),
    )
}

export function hasExpensiveBuildProcessGroupSurvivedSigkill(log: string): boolean {
  const marker = `with-host-lock: expensive-build ${hostLockProcessGroupSurvivedSigkillMarker}`
  return hasEmittedLogLine(log, marker)
}

export function hasEmittedExpensiveBuildCommandTimeout(log: string): boolean {
  const marker = 'with-host-lock: expensive-build command exceeded '
  return log
    .split('\n')
    .some(
      line =>
        /with-host-lock: expensive-build command exceeded \d+s; terminating its process group/.test(
          line,
        ) && hasEmittedLogLine(line, marker),
    )
}
