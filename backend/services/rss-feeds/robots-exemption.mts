/**
 * Resolve whether robots.txt allow/disallow rules should be ignored when fetching an RSS feed.
 *
 * Precedence (most-specific wins): feed → hostname → globalDefault.
 * NULL means "inherit from the next level".
 *
 * Note: operator hard-blocks (blacklist, blocked=TRUE, crawlable=FALSE) are enforced
 * separately by isUrlCrawlable regardless of this value.
 */
export function resolveIgnoreRobotsTxt(
  feedOverride: boolean | null | undefined,
  hostnameOverride: boolean | null | undefined,
  globalDefault: boolean,
): boolean {
  return feedOverride ?? hostnameOverride ?? globalDefault
}
