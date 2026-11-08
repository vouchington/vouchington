import type { PageInfo } from '@voucha/types/pagination'
import {
  encodeFollowingCursor,
  encodeRelevanceCursor,
  FOLLOWING_PHASE_START_ID,
} from './bounded-cursors.mts'
import type { PostSearchRow } from './get-ids-types.mts'
import { buildPostSearchPageInfo, type PostSearchCursorValues } from './get-ids-page-info.mts'
import { encodeCursor } from '@modules/pagination'
import { stableHotCursorScope } from './stable-hot-rank.mts'

export type CandidateMetadata = {
  inspected_id?: string | null
  candidate_has_more?: boolean
  cohort_hi?: string | null
  cohort_lo?: string | null
  candidate_cap?: number
  inspected_score?: string | number | null
}

export function buildDefaultBoundedPage(
  rows: readonly PostSearchRow[],
  first: CandidateMetadata | undefined,
  limit: number,
  sort: string,
  hasRankingScore: boolean,
  boundedCandidates: boolean,
): PageInfo {
  const results = rows.slice(0, limit)
  const rawHasMore = boundedCandidates && first?.candidate_has_more === true
  const pageInfo = buildPostSearchPageInfo(
    results,
    rows.length > limit || rawHasMore,
    sort,
    hasRankingScore,
  )
  if (
    !boundedCandidates ||
    sort === 'following_new' ||
    (sort === 'relevance' && hasRankingScore) ||
    !rawHasMore ||
    results.length >= limit ||
    !first?.inspected_id
  )
    return pageInfo
  const boundaryId = first.inspected_id
  const endCursor =
    sort === 'best'
      ? encodeCursor({ score: Number(first.inspected_score), id: boundaryId })
      : sort === 'hot' || sort === 'trending'
        ? encodeCursor({
            score: Number(first.inspected_score),
            id: boundaryId,
            scope: stableHotCursorScope(sort),
          })
        : encodeCursor({ id: boundaryId })
  return { ...pageInfo, end_cursor: endCursor }
}

export function buildFollowingBoundedPage(
  rows: readonly PostSearchRow[],
  first: CandidateMetadata | undefined,
  limit: number,
  cursor: PostSearchCursorValues,
): PageInfo {
  const phase = cursor.following_phase ?? 'followed'
  const results = rows.slice(0, limit)
  const firstResult = results[0]
  const lastResult = results.at(-1)
  const hasAnotherResult = rows.length > limit
  const hasAnotherRaw = first?.candidate_has_more === true
  const inspectedId = first?.inspected_id
  const next =
    hasAnotherResult && lastResult
      ? { phase, id: lastResult.id }
      : hasAnotherRaw && inspectedId
        ? { phase, id: inspectedId }
        : phase === 'followed'
          ? { phase: 'other' as const, id: FOLLOWING_PHASE_START_ID, start: true as const }
          : null
  return {
    has_next_page: next !== null,
    start_cursor: firstResult ? encodeFollowingCursor({ phase, id: firstResult.id }) : null,
    end_cursor: next ? encodeFollowingCursor(next) : null,
  }
}

export function buildRelevanceBoundedPage(
  rows: readonly PostSearchRow[],
  first: CandidateMetadata | undefined,
  limit: number,
  cursor: PostSearchCursorValues,
): PageInfo {
  const results = rows.slice(0, limit)
  const firstResult = results[0]
  const lastResult = results.at(-1)
  const hi = first?.cohort_hi
  const lo = first?.cohort_lo
  const cap = first?.candidate_cap
  const older = cursor.cohort_older ?? first?.candidate_has_more === true
  if (!hi || !lo || cap === undefined)
    return { has_next_page: false, start_cursor: null, end_cursor: null }
  const within = (row: PostSearchRow) => ({
    kind: 'within' as const,
    hi,
    lo,
    cap,
    older,
    ranking: requiredRanking(row),
    id: row.id,
  })
  const next =
    rows.length > limit && lastResult
      ? within(lastResult)
      : older
        ? { kind: 'next' as const, id: lo }
        : null
  return {
    has_next_page: next !== null,
    start_cursor: firstResult ? encodeRelevanceCursor(within(firstResult)) : null,
    end_cursor: next ? encodeRelevanceCursor(next) : null,
  }
}

function requiredRanking(row: PostSearchRow): number {
  const ranking = Number(row.ranking_score)
  if (!Number.isFinite(ranking)) throw new Error('Bounded relevance rank missing')
  return ranking
}
