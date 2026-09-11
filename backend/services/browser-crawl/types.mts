export interface BrowserCrawlResult {
  statusCode: number
  hasContent: boolean
  title: string
  contentLength: number
  html?: string
  /** The landed URL after following any server/client redirects (`page.url()` post-navigation). */
  finalUrl: string
}
