export type CrawlEmbedsJobPayloads = {
  backfill_crawl_embeds: Record<string, never>
  resolve_crawl_oembed: ResolveCrawlOembedData
}

export type ResolveCrawlOembedData = { crawl_id: string }

export type CrawlEmbedEntry = {
  crawlId: string
  endpointHostname: string
}

export type EnqueueCrawlEmbedOptions = {
  /** Hostname of the persisted oEmbed endpoint; used only for queue ordering. */
  endpointHostname: string
  priority?: number
}
