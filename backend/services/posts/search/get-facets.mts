import type { PrivateUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import { buildCountQuery, hasSemanticSearch } from '@modules/search-utils'
import { getPostsWorkLimit } from '../work-limits.mts'
import sql from 'sql-template-strings'

type PostSearchFacets = {
  total_count: number
}

export async function getPostFacets(
  currentUser?: PrivateUser,
  options: PostSearchOptions = {},
): Promise<PostSearchFacets> {
  // Compute embedding for semantic search before building query
  let semanticSearchEmbedding: number[] | undefined
  if (hasSemanticSearch(options)) {
    semanticSearchEmbedding = await getCachedSearchEmbedding(options.semantic_search_query!)
  }

  // Build the base query, ignoring pagination cursors
  const baseQuery = buildPostSearchQuery(currentUser, {
    ...options,
    // Strip pagination cursors
    after: undefined,
    id_lt: undefined,
    vote_score_lt: undefined,
    ranking_lt: undefined,
    // Skip LIMIT and ORDER BY for count queries
    omitLimit: true,
    omitOrderBy: true,
    semanticSearchEmbedding,
  })

  // Wrap in COUNT query
  const countQuery = buildCountQuery(baseQuery)

  const { rows } = await executePostSearchQuery(countQuery, semanticSearchEmbedding !== undefined)

  return {
    total_count: Number.parseInt(rows[0]?.total_count || '0', 10),
  }
}

type UserPostTypeFacets = Record<'review' | 'discussion' | 'comment', number>

export type UserPostTypeFacetResult = {
  public: UserPostTypeFacets
  viewer?: UserPostTypeFacets
  capped: boolean
}

function emptyFacets(): UserPostTypeFacets {
  return { review: 0, discussion: 0, comment: 0 }
}

/** One eligibility scan for this viewer, stopped after cap + 1 matching posts. */
function buildCappedFacetQuery(userId: string, currentUser: PrivateUser | undefined, cap: number) {
  const inner = buildPostSearchQuery(currentUser, {
    user_id: userId,
    post_types: ['review', 'discussion', 'comment'],
    omitLimit: true,
    omitOrderBy: true,
  })
  return sql`/* getUserPostTypeFacets */
    WITH matched AS (
      SELECT candidate.post_type
      FROM (`.append(inner).append(sql`) AS candidate
      LIMIT ${cap + 1}
    ),
    numbered AS (
      SELECT post_type, row_number() OVER () AS rn
      FROM matched
    )
    SELECT post_type,
           COUNT(*) FILTER (WHERE rn <= ${cap})::int AS total_count,
           (SELECT COUNT(*) > ${cap} FROM numbered) AS capped
    FROM numbered
    GROUP BY post_type`)
}

export async function getUserPostTypeFacets(
  userId: string,
  currentUser?: PrivateUser,
): Promise<UserPostTypeFacetResult> {
  const cap = getPostsWorkLimit('profile_post_count_cap')
  const { rows } = await executePostSearchQuery(
    buildCappedFacetQuery(userId, currentUser, cap),
    false,
  )
  const counts = emptyFacets()
  let capped = false
  for (const row of rows as {
    post_type: keyof UserPostTypeFacets
    total_count: number | string
    capped: boolean | null
  }[]) {
    counts[row.post_type] = Number(row.total_count)
    capped = capped || row.capped === true
  }
  return {
    public: counts,
    ...(currentUser ? { viewer: { ...counts } } : {}),
    capped,
  }
}
