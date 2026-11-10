import type { BasicUser } from '@services/users/types'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import type { PostSearchOptions } from './types.mts'
import type { PostSearchRow } from './get-ids-types.mts'

type FollowingPhase = 'followed' | 'other'

/** Followed authors first, then everyone else. Each phase is one id walk. */
export async function readFollowingNewRows(
  currentUser: BasicUser,
  options: PostSearchOptions,
  pageLimit: number,
  hasSemanticSearch: boolean,
): Promise<{ rows: PostSearchRow[]; hasNextPage: boolean }> {
  const inOtherPhase = options.ranking_lt === 0
  const followedRows = inOtherPhase
    ? []
    : await readPhase(currentUser, options, 'followed', pageLimit + 1, hasSemanticSearch)
  if (followedRows.length > pageLimit)
    return { rows: followedRows.slice(0, pageLimit), hasNextPage: true }

  const remaining = pageLimit - followedRows.length
  const otherOptions = inOtherPhase
    ? options
    : { ...options, id_lt: undefined, ranking_lt: undefined }
  const otherRows = await readPhase(
    currentUser,
    otherOptions,
    'other',
    remaining + 1,
    hasSemanticSearch,
  )
  return {
    rows: [...followedRows, ...otherRows.slice(0, remaining)],
    hasNextPage: otherRows.length > remaining,
  }
}

async function readPhase(
  currentUser: BasicUser,
  options: PostSearchOptions,
  phase: FollowingPhase,
  limit: number,
  hasSemanticSearch: boolean,
): Promise<PostSearchRow[]> {
  const phaseOptions: PostSearchOptions = {
    ...options,
    sort: 'following_new',
    following_phase: phase,
    limit,
    ranking_lt: undefined,
    id_lt: undefined,
    vote_score_lt: undefined,
    hot_score_lt: undefined,
  }
  if (options.id_lt !== undefined) {
    phaseOptions.id_lt = options.id_lt
    phaseOptions.ranking_lt = phase === 'followed' ? 1 : 0
  }
  const query = buildPostSearchQuery(currentUser, phaseOptions)
  const { rows } = await executePostSearchQuery<PostSearchRow>(query, hasSemanticSearch)
  return rows
}
