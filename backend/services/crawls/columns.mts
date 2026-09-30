import type { CrawlBasic } from './types.mts'

type CrawlBasicColumn = Exclude<keyof CrawlBasic, '__entity_type'>
type CrawlBasicRow = Omit<CrawlBasic, '__entity_type'>

// Every stored CrawlBasic column and nothing else. `__entity_type` is not a column;
// mapCrawlBasicRow adds it after the read.
const crawlBasicColumnNames = Object.keys({
  id: true,
  url_id: true,
  crawler_id: true,
  created_at: true,
  last_modified_at: true,
  etag: true,
  html_sha256: true,
  html_snapshot_uploaded_at: true,
  request_headers: true,
  response_headers: true,
  response_status_code: true,
  redirect_url_id: true,
  network_error: true,
  completed_at: true,
  embeddings_generated_at: true,
  has_pending_embeddings: true,
  markdown: true,
  title: true,
  links: true,
  meta_tags: true,
  embed_metadata: true,
  embed_oembed_url: true,
  embed_oembed_resolved_at: true,
  lang: true,
} satisfies Record<CrawlBasicColumn, true>)

/** CrawlBasic columns for a single-table `FROM crawls` SELECT. */
export const crawlBasicColumns = crawlBasicColumnNames.join(', ')

export function mapCrawlBasicRow(row: CrawlBasicRow): CrawlBasic {
  return {
    __entity_type: 'crawl',
    ...row,
  }
}
