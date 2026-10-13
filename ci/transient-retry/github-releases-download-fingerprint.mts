/**
 * Shared GitHub Releases download classifiers.
 *
 * Gitleaks and Lychee download pinned assets through `ci/install-github-release.sh`.
 * Callers keep their own job, installer, and terminal-exit anchors, then call these helpers
 * on that anchored slice. The helpers do not decide which job or terminal marker is in scope.
 *
 * Curl `(22)` with HTTP 000/5xx stays on `hasCurlGithubReleaseTransportFailure`.
 * `isGithubReleasesDownloadFlake` still requires the asset URL and does not treat curl `(22)`
 * alone as a CDN flake.
 */

const curlOperationTimeout = 'curl: (28)'
const curlRecvFailure = 'curl: (56)'
const curlHttpStatusFailure = /curl: \(22\).* (?:000|5\d\d)/

/** Curl transport failure printed by `ci/install-github-release.sh` before its own exit. */
export function hasCurlGithubReleaseTransportFailure(log: string): boolean {
  return (
    log.includes(curlOperationTimeout) ||
    log.includes(curlRecvFailure) ||
    curlHttpStatusFailure.test(log)
  )
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
