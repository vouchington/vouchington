/**
 * Shared GitHub Releases download classifiers.
 *
 * Gitleaks and Lychee download pinned assets through vouchington-tooling's `install-github-release.sh`.
 * Callers keep their own job and installer anchors, then call these helpers on that slice.
 * The helpers do not decide which job is in scope.
 *
 * Curl `(22)` with HTTP 000/5xx stays on `hasCurlGithubReleaseTransportFailure`.
 * `isGithubReleasesDownloadFlake` still requires the asset URL and does not treat curl `(22)`
 * alone as a CDN flake. `hasCurlGithubReleaseTransportExit` pairs those curl lines with the
 * process exit: `curl -fsSL` under `set -e` propagates 22, 28, or 56, and older wrappers
 * reported the same lines as exit 1.
 */

const curlOperationTimeout = 'curl: (28)'
const curlRecvFailure = 'curl: (56)'
const curlHttpStatusFailure = /curl: \(22\).* (?:000|5\d\d)/

/** Curl transport failure printed by vouchington-tooling's `install-github-release.sh` before its own exit. */
export function hasCurlGithubReleaseTransportFailure(log: string): boolean {
  return (
    log.includes(curlOperationTimeout) ||
    log.includes(curlRecvFailure) ||
    curlHttpStatusFailure.test(log)
  )
}

function terminalProcessExitCode(log: string): number | undefined {
  let exitCode: number | undefined
  for (const match of log.matchAll(/##\[error\]Process completed with exit code (\d+)\./g)) {
    const parsed = Number(match[1])
    if (Number.isInteger(parsed)) exitCode = parsed
  }
  return exitCode
}

// The exit has to be the status curl itself would propagate for the marker in this slice.
// Exit 1 remains the older wrapper. A different exit, including curl (22) for HTTP 404, fails closed.
export function hasCurlGithubReleaseTransportExit(log: string): boolean {
  const exitCode = terminalProcessExitCode(log)
  if (exitCode === 1) return hasCurlGithubReleaseTransportFailure(log)
  if (exitCode === 22) return curlHttpStatusFailure.test(log)
  if (exitCode === 28) return log.includes(curlOperationTimeout)
  if (exitCode === 56) return log.includes(curlRecvFailure)
  return false
}

export function isGithubReleasesDownloadFlake(
  logSlice: string,
  assetUrlSubstring: string,
): boolean {
  return (
    logSlice.includes(assetUrlSubstring) &&
    (/HTTP (?:000|5\d\d)/.test(logSlice) ||
      /Unexpected HTTP response: 5\d\d/.test(logSlice) ||
      logSlice.includes(curlOperationTimeout) ||
      logSlice.includes(curlRecvFailure) ||
      /tim(?:e|ed) out|timeout/i.test(logSlice))
  )
}
