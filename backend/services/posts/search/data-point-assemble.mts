import { encodeCursor, walkSourceWindow } from '@modules/pagination'
import createHttpError from 'http-errors'
import {
  MAX_UUID,
  type DataPointCursor,
  type DataPointPhase,
  type DataPointSearchPage,
  type DataPointSearchResult,
} from './data-point-types.mts'

type DataPointRow = {
  phase: DataPointPhase
  parent_ord: number
  community_id: string | null
  post_id: string | null
  title: string | null
  data_point_vertical: string | null
  structured_data: Record<string, unknown> | null
  eligible: boolean
}

export type RawDataPointRow = {
  phase: string | null
  parent_ord: number | string | null
  community_id: string | null
  post_id: string | null
  title: string | null
  data_point_vertical: string | null
  structured_data: Record<string, unknown> | null
  eligible: boolean | null
  parent_has_more: boolean
  next_community_id: string | null
}

export function assembleDataPointPage(
  rows: RawDataPointRow[],
  input: { limit: number; childLimit: number },
): DataPointSearchPage {
  const parentHasMore = rows[0]?.parent_has_more ?? false
  const nextCommunityId = rows[0]?.next_community_id ?? null
  const realRows = rows.filter(row => row.phase === 'null' || row.phase === 'community')
  if (realRows.length === 0) return emptyDataPointPage(parentHasMore, nextCommunityId)

  const groups: RawDataPointRow[][] = []
  for (const row of realRows) {
    const last = groups.at(-1)
    if (
      last?.[0] &&
      last[0].phase === row.phase &&
      last[0].parent_ord === row.parent_ord &&
      last[0].community_id === row.community_id
    ) {
      last.push(row)
    } else groups.push([row])
  }

  const seen = new Set<string>()
  const walked = walkSourceWindow({
    parents: groups.map(group => {
      const head = group[0]!
      const phase: DataPointPhase = head.phase === 'community' ? 'community' : 'null'
      const communityId = head.community_id
      const items: DataPointRow[] = []
      for (const row of group) {
        if (row.post_id) items.push(normalizeDataPointRow(row))
      }
      return {
        items,
        openCursor: (item: DataPointRow) => openDataPointCursor(phase, communityId, item.post_id),
        exhaustedCursor: exhaustedDataPointCursor(phase, communityId),
      }
    }),
    childLimit: input.childLimit,
    resultLimit: input.limit,
    parentHasMore,
    accept: item => {
      if (!item.eligible || !item.post_id || seen.has(item.post_id)) return null
      seen.add(item.post_id)
      return {
        id: item.post_id,
        title: item.title ?? '',
        data_point_vertical: item.data_point_vertical,
        structured_data: item.structured_data ?? {},
      }
    },
  })
  return pageFromCursors(walked.results, walked.hasNextPage, walked.resume, walked.start)
}

function emptyDataPointPage(
  parentHasMore: boolean,
  nextCommunityId: string | null,
): DataPointSearchPage {
  if (!parentHasMore || !nextCommunityId) {
    return {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }
  return pageFromCursors(
    [],
    true,
    {
      phase: 'community',
      parent_open: true,
      community_id: nextCommunityId,
      post_id: MAX_UUID,
    },
    null,
  )
}

function pageFromCursors(
  results: DataPointSearchResult[],
  hasNextPage: boolean,
  resume: DataPointCursor | null,
  start: DataPointCursor | null,
): DataPointSearchPage {
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: start ? encodeCursor(start) : null,
      end_cursor: hasNextPage && resume ? encodeCursor(resume) : null,
    },
  }
}

function normalizeDataPointRow(row: RawDataPointRow): DataPointRow {
  if (row.phase !== 'null' && row.phase !== 'community') {
    throw createHttpError(500, 'Invalid data-point page row')
  }
  return {
    phase: row.phase,
    parent_ord: asNumber(row.parent_ord),
    community_id: row.community_id,
    post_id: row.post_id,
    title: row.title,
    data_point_vertical: row.data_point_vertical,
    structured_data: row.structured_data,
    eligible: row.eligible === true,
  }
}

function openDataPointCursor(
  phase: DataPointPhase,
  communityId: string | null,
  postId: string | null,
): DataPointCursor {
  if (!postId) throw createHttpError(500, 'Invalid data-point page row')
  return { phase, parent_open: true, community_id: communityId, post_id: postId }
}

function exhaustedDataPointCursor(
  phase: DataPointPhase,
  communityId: string | null,
): DataPointCursor {
  return { phase, parent_open: false, community_id: communityId, post_id: null }
}

function asNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw createHttpError(500, 'Invalid data-point page row')
  return parsed
}
