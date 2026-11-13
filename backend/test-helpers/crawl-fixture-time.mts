/** Historical crawl fixtures must fit the bootstrapped previous UTC month. */
export function getTestCrawlPreviousMonthInstant(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12))
}
