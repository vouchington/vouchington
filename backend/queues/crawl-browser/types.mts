export interface CrawlBrowserJobData {
  linkId: string
  urlId: string
  crawlerId: string
}

export type CrawlBrowserJobPayloads = {
  crawl_browser: CrawlBrowserJobData
}
