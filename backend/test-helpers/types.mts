/**
 * Common types for test helpers
 */

export type TestCrawlWithChunks = {
  user: unknown
  url: { id: string } | null
  crawler: { id: string }
  crawl: { id: string }
}
