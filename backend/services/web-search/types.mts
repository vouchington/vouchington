import type { ViewUrl } from '@services/urls/types'
import type { PageInfo } from '@voucha/types/pagination'

export type WebSearchOptions = {
  query: string
  limit?: number
  /** Opaque `page_info.end_cursor` from the previous page of the same query. */
  after?: string
}

export type WebSearchResult = {
  url: ViewUrl
  snippet: string | null
  match_type: 'content' | 'url'
}

export type WebSearchResponse = {
  results: WebSearchResult[]
  page_info: PageInfo
}
