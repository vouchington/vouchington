import type { ParsedFeed } from '@vouchington/rss-parser'

/** Parsed RSS, Atom, JSON, or RDF feed stored in rss_feed_crawls.feed_data. */
export type { ParsedFeed }

export interface CrawlerRssOptions {
  /**
   * Custom HTTP headers to include in the request.
   * The User-Agent header will be automatically added and will override any User-Agent in this object.
   */
  headers?: Record<string, string>
  /**
   * Request timeout in milliseconds. Default: 10000 (10 seconds)
   */
  timeoutMs?: number
  /**
   * Maximum response size in bytes. Default: 10485760 (10MB)
   * This helps prevent gzip bombs and memory exhaustion.
   */
  maxResponseSizeBytes?: number
}

export interface CrawlerRssSuccess {
  responseCode: number
  feed: ParsedFeed | null
  contentSha256: Buffer | null
  headers: {
    etag: string | null
    lastModified: string | null
  }
}

export interface CrawlerRssRedirect {
  responseCode: number
  feed: null
  contentSha256: null
  headers: {
    etag: string | null
    lastModified: string | null
  }
  redirect: {
    location: string
    isPermanent: boolean
  }
}

export type CrawlerRssResult = CrawlerRssSuccess | CrawlerRssRedirect
