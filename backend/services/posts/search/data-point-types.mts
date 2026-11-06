import type { PageInfo } from '@voucha/types/pagination'

export const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
export const DATA_POINT_CURSOR_KEYS = ['phase', 'parent_open', 'community_id', 'post_id'] as const

export type SearchDataPointsOptions = {
  topic_id?: string
  vertical?: string
  result?: string
  credit_score_range?: string
  limit?: number
  after?: string
}

export type DataPointSearchResult = {
  id: string
  title: string
  data_point_vertical: string | null
  structured_data: Record<string, unknown>
}

export type DataPointSearchPage = {
  results: DataPointSearchResult[]
  page_info: PageInfo
}

export type DataPointPhase = 'null' | 'community'

export type DataPointCursor = {
  phase: DataPointPhase
  parent_open: boolean
  community_id: string | null
  post_id: string | null
}
