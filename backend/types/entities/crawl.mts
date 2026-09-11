import type { ResolvedEmbed } from '@vouchington/embeds'

export type CrawlNetworkError = 'timeout' | 'dns' | 'ssrf'

export type CrawlerHtmlStructuredValue =
  | null
  | boolean
  | number
  | string
  | CrawlerHtmlStructuredValue[]
  | { [key: string]: CrawlerHtmlStructuredValue }

export type CrawlerHtmlStructuredObject = Record<string, CrawlerHtmlStructuredValue>

export type CrawlBasic = {
  __entity_type: 'crawl'
  url_id: string
  id: string
  created_at: Date
  crawler_id: string
  last_modified_at: Date | null
  etag: string | null
  html_sha256: Buffer | null
  html_snapshot_uploaded_at: Date | null
  request_headers: Record<string, string>
  response_headers: Record<string, string>
  response_status_code: number
  redirect_url_id: string | null
  network_error: CrawlNetworkError | null
  completed_at: Date | null
  has_pending_embeddings: boolean
  embeddings_generated_at: Date | null
  markdown: string
  title: string | null
  links: CrawlerHtmlStructuredObject
  meta_tags: CrawlerHtmlStructuredObject
  embed_metadata: ResolvedEmbed | null
  embed_oembed_url: string | null
  embed_oembed_resolved_at: Date | null
  lang: string | null
}
