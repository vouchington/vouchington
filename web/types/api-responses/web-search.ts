import type * as Api from './shared'

type PageInfo = Api.PageInfo

export interface WebSearchResultHostname {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
}

export interface WebSearchResultUrl {
  __entity_type: 'url'
  id: string
  url: string
  pathname: string
  search_params: Record<string, string>
  canonical_url_id: string | null
  hostname: WebSearchResultHostname | null
}

export interface WebSearchResultItem {
  url: WebSearchResultUrl
  snippet: string | null
  match_type: 'content' | 'url'
}

export interface WebSearchResponseBody {
  results: WebSearchResultItem[]
  page_info: PageInfo
}
