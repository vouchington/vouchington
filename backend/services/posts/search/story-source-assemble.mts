import { encodeCursor, walkSourceWindow } from '@modules/pagination'
import type { PostSearchResult } from './types.mts'
import createHttpError from 'http-errors'
import {
  MAX_UUID,
  OPEN_PUBLISHED_AT,
  type StoryCursor,
  type StoryPage,
  type StoryPhase,
} from './story-source-types.mts'

type StorySourceRow = {
  feed_id: string
  feed_ord: number
  item_id: string | null
  published_at: string | null
  phase: StoryPhase | null
  child_rank: number | null
  post_id: string | null
  post_type: string | null
  eligible: boolean
}

export type RawStoryRow = {
  feed_id: string | null
  feed_ord: number | string | null
  item_id: string | null
  published_at: string | null
  phase: string | null
  child_rank: number | string | null
  post_id: string | null
  post_type: string | null
  eligible: boolean | null
  parent_has_more: boolean
  next_feed_id: string | null
}

export function assembleStorySourcePage(
  rows: RawStoryRow[],
  input: { limit: number; childLimit: number },
): StoryPage {
  const parentHasMore = rows[0]?.parent_has_more ?? false
  const nextFeedId = rows[0]?.next_feed_id ?? null
  const realRows = rows.filter(row => row.feed_id)
  if (realRows.length === 0) {
    return emptyStoryPage(parentHasMore, nextFeedId)
  }

  const groups: RawStoryRow[][] = []
  for (const row of realRows) {
    const last = groups.at(-1)
    if (last && last[0]?.feed_id === row.feed_id && last[0]?.feed_ord === row.feed_ord)
      last.push(row)
    else groups.push([row])
  }

  const seen = new Set<string>()
  const walked = walkSourceWindow({
    parents: groups.map(group => {
      const feedId = requiredString(group[0]?.feed_id, 'feed_id')
      const ranked: StorySourceRow[] = []
      for (const row of group) {
        if (row.item_id) ranked.push(normalizeStoryRow(row, feedId))
      }
      const items = ranked.toSorted(
        (left, right) => (left.child_rank ?? 0) - (right.child_rank ?? 0),
      )
      return {
        items,
        openCursor: (item: StorySourceRow) => openStoryCursor(feedId, item),
        exhaustedCursor: exhaustedStoryCursor(feedId),
      }
    }),
    childLimit: input.childLimit,
    resultLimit: input.limit,
    parentHasMore,
    accept: item => {
      if (!item.eligible || !item.post_id || !item.post_type || seen.has(item.post_id)) return null
      seen.add(item.post_id)
      return {
        __entity_type: 'post' as const,
        id: item.post_id,
        post_type: item.post_type,
      }
    },
  })

  return pageFromCursors(walked.results, walked.hasNextPage, walked.resume, walked.start)
}

function emptyStoryPage(parentHasMore: boolean, nextFeedId: string | null): StoryPage {
  if (!parentHasMore || !nextFeedId) {
    return {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }
  const resume: StoryCursor = {
    feed_id: nextFeedId,
    feed_open: true,
    phase: 'published',
    item_id: MAX_UUID,
    published_at: OPEN_PUBLISHED_AT,
  }
  return pageFromCursors([], true, resume, null)
}

function pageFromCursors(
  results: PostSearchResult[],
  hasNextPage: boolean,
  resume: StoryCursor | null,
  start: StoryCursor | null,
): StoryPage {
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: start ? encodeCursor(start) : null,
      end_cursor: hasNextPage && resume ? encodeCursor(resume) : null,
    },
  }
}

function normalizeStoryRow(row: RawStoryRow, feedId: string): StorySourceRow {
  const phase = row.phase
  if (phase !== null && phase !== 'published' && phase !== 'missing') {
    throw createHttpError(500, 'Invalid story page row')
  }
  return {
    feed_id: feedId,
    feed_ord: asNumber(row.feed_ord),
    item_id: row.item_id,
    published_at: row.published_at,
    phase,
    child_rank: row.child_rank === null ? null : asNumber(row.child_rank),
    post_id: row.post_id,
    post_type: row.post_type,
    eligible: row.eligible === true,
  }
}

function openStoryCursor(feedId: string, item: StorySourceRow): StoryCursor {
  return {
    feed_id: feedId,
    feed_open: true,
    phase: item.phase ?? 'published',
    item_id: item.item_id,
    published_at: item.phase === 'missing' ? null : item.published_at,
  }
}

function exhaustedStoryCursor(feedId: string): StoryCursor {
  return {
    feed_id: feedId,
    feed_open: false,
    phase: 'published',
    item_id: null,
    published_at: null,
  }
}

function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw createHttpError(500, 'Invalid story page row')
  return parsed
}

function requiredString(value: unknown, column: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw createHttpError(500, `${column} missing from story page`)
  }
  return value
}
