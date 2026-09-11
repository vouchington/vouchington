/**
 * Shared "GitHub Releases CDN flake" classifier (see CLAUDE.md § "How to broaden a
 * fingerprint"). Several tools (gitleaks, Lychee, and Trivy) each download a
 * pinned asset from `.../releases/download/...` at CI setup time and can hit the same class
 * of transient CDN failure — an HTTP 5xx/000 response, a curl transport failure, or a
 * timeout — even though each tool's own log text and terminal-failure marker differ.
 *
 * Callers own their own consumer anchor: find their tool-specific terminal-failure marker,
 * slice the log from there, then call this to classify whether that slice looks like a
 * transient CDN flake for the given asset. This function does not itself decide *which* job
 * or terminal marker is in scope — only whether the failure mode is a CDN flake.
 */
export function isGithubReleasesDownloadFlake(
  logSlice: string,
  assetUrlSubstring: string,
): boolean {
  return (
    logSlice.includes(assetUrlSubstring) &&
    (/HTTP (?:000|5\d\d)/.test(logSlice) ||
      /Unexpected HTTP response: 5\d\d/.test(logSlice) ||
      logSlice.includes('curl: (28)') ||
      logSlice.includes('curl: (56)') ||
      /tim(?:e|ed) out|timeout/i.test(logSlice))
  )
}
