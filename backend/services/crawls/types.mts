// Canonical definitions live in @voucha/types/entities/crawl (avoids a
// @services/crawl-chunks <-> @services/crawls workspace cycle: crawl-chunks
// needs the CrawlBasic shape but must not depend back on services/crawls).
import type {
  CrawlNetworkError,
  CrawlerHtmlStructuredValue,
  CrawlerHtmlStructuredObject,
  CrawlBasic,
} from '@voucha/types/entities/crawl'

export type {
  CrawlNetworkError,
  CrawlerHtmlStructuredValue,
  CrawlerHtmlStructuredObject,
  CrawlBasic,
}

export type CreateCrawlOptions = {
  url_id: string
  crawler_id: string
  last_modified_at?: Date | null
  etag?: string | null
}

export type UpdateCrawlOptions = {
  url_id: string
  created_at: Date
  last_modified_at?: Date | null
  etag?: string | null
  html_sha256?: Buffer | null
  html_snapshot_uploaded_at?: Date | null
  request_headers?: Record<string, string>
  response_headers?: Record<string, string>
  response_status_code?: number
  redirect_url_id?: string | null
  network_error?: CrawlNetworkError | null
  completed_at?: Date | null
  has_pending_embeddings?: boolean
  markdown?: string
  title?: string | null
  links?: CrawlerHtmlStructuredObject
  meta_tags?: CrawlerHtmlStructuredObject
  embed_metadata?: CrawlBasic['embed_metadata']
  embed_oembed_url?: string | null
  embed_oembed_resolved_at?: Date | null
  embeddings_generated_at?: Date | null
  lang?: string | null
}
