export type CrawlEmbedsJobs = 'backfill_crawl_embeds' | 'resolve_crawl_oembed'

export type CrawlEmbedEntry = {
  crawlId: string
  endpointHostname: string
}

export type EnqueueCrawlEmbedOptions = {
  /** Hostname of the persisted oEmbed endpoint; used only for queue ordering. */
  endpointHostname: string
  priority?: number
}
