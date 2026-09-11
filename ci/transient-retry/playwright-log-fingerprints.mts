import { hasEmittedLogLine, hostLockAcquireTimeoutMarker } from './host-lock-fingerprints.mts'

// Exported so the marker-freshness guard (step-group-marker-freshness.test.mts) can assert this
// stays in sync with vouchington-tooling's packaged wait-for-apt-locks.sh, rather than the guard
// duplicating a literal that could drift independently of this matcher (see PR #10604).
export const aptLockWaitTimeoutMarker = 'Timed out waiting for apt/dpkg locks after '

export function hasPlaywrightSetupAptLockFailure(log: string): boolean {
  const isPlaywrightSetup = log.includes('Run ./.github/actions/setup-playwright')
  const isProcessExit1 = log.includes('##[error]Process completed with exit code 1.')
  // The legacy browser-install prefix was captured in run 27805129632. The
  // dependency-repair prefix comes from the pinned Playwright 1.61.1
  // install-deps handler and is covered by the companion rule fixture.
  const isPlaywrightInstallFailure = [
    'Failed to install browsers',
    'Failed to install browser dependencies',
  ].some(prefix => log.includes(prefix))
  const isAptLockFailure =
    log.includes('Could not get lock /var/') &&
    isPlaywrightInstallFailure &&
    log.includes('Error: Installation process exited with code: 100')
  // vouchington-tooling's wait-for-apt-locks.sh moved this emitter out of this repo (#9963); it now
  // reads "…locks after ${timeout_seconds}s: …" rather than "…locks before Playwright install…".
  const isWaitTimeout = hasEmittedLogLine(log, aptLockWaitTimeoutMarker)
  const isHostLockTimeout = hasEmittedLogLine(
    log,
    `with-host-lock: host-package-manager ${hostLockAcquireTimeoutMarker}`,
  )

  return (
    isPlaywrightSetup && isProcessExit1 && (isAptLockFailure || isWaitTimeout || isHostLockTimeout)
  )
}
