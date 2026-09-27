export interface CrawlerResponse {
  id: string
  description: string
  crawler_type: string
  priority: number
  css_selectors_to_remove: string[]
  link_text_content_to_remove: string[]
  link_hrefs_to_remove: string[]
}

export interface CrawlerDetailResponseBody {
  crawler: CrawlerResponse
}
