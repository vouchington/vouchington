import type { CrawlBasic } from './types.mts'

const CSR_EMPTY_SHELL_THRESHOLD = 50

/**
 * Detect if a fetch crawl result is likely a CSR-only page (empty shell).
 * Returns true if the page returned 200 with a valid title but almost no markdown content,
 * suggesting the page relies on client-side JavaScript to render.
 */
export function isCsrEmptyShell(crawlResult: CrawlBasic): boolean {
  if (crawlResult.response_status_code !== 200) return false
  if (!crawlResult.title?.trim()) return false
  const markdownLength = crawlResult.markdown?.trim().length ?? 0
  return markdownLength < CSR_EMPTY_SHELL_THRESHOLD
}
