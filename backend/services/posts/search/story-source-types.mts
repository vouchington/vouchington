import type { SQLStatement } from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'
import type { PostSearchResult } from './types.mts'

export const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
export const OPEN_PUBLISHED_AT = '9999-12-31T23:59:59.999999Z'
export const PUBLISHED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
export const STORY_CURSOR_KEYS = [
  'feed_id',
  'feed_open',
  'phase',
  'item_id',
  'published_at',
] as const

export type StoryPhase = 'published' | 'missing'

export type StoryCursor = {
  feed_id: string
  feed_open: boolean
  phase: StoryPhase
  item_id: string | null
  published_at: string | null
}

export type StoryPage = {
  results: PostSearchResult[]
  page_info: PageInfo
}

export type StoryFeedBounds = {
  published: SQLStatement | null
  missingItemUpper: string | null
}
