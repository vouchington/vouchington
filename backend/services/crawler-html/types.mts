import type { CrawlerHtmlToMarkdownResult } from '@vouchington/crawler-html'
import type { ResolvedEmbed } from '@vouchington/embeds'
import type { ResolvedSafeAddress } from 'ssrf-guard'

export interface CrawlerHtmlOptions {
  url: string
  lastModifiedAt?: string
  etag?: string
  /** Bounds DNS/connect + sending the request + receiving response headers. Does not cover the
   *  body download. Default: 5000 (5 seconds). */
  requestTimeoutMs?: number
  /** Bounds the body-download phase, starting once headers arrive. Default: 5000 (5 seconds). */
  responseTimeoutMs?: number
  /** Maximum response size in bytes. Default: 10485760 (10MB). */
  maxResponseSizeBytes?: number
  /** Skip optional local embed planning when the caller only needs crawl metadata. */
  skipEmbedResolution?: boolean
  /** Pre-resolved DNS addresses from SSRF validation, pinned to avoid TOCTOU rebinding. */
  resolvedAddresses?: ResolvedSafeAddress[]
}

export interface CrawlerHtmlTempFile {
  byteLength: number
  cleanup: () => Promise<void>
  filePath: string
}

export interface CrawlerHtmlResult {
  request_headers: Record<string, string>
  response_headers: Record<string, string>
  response_status_code: number
  crawl_started_at: Date
  crawl_completed_at: Date
  content?: CrawlerHtmlToMarkdownResult
  /** Null records a successful authoritative no-embed decision; undefined means not planned. */
  embedMetadata?: ResolvedEmbed | null
  embedOEmbedUrl?: string | null
  htmlFile?: CrawlerHtmlTempFile
}
