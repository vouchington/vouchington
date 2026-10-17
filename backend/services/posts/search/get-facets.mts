import type { PrivateUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import { buildCountQuery, hasSemanticSearch } from '@modules/search-utils'
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

export type UserPostTypeFacets = Record<'review' | 'discussion' | 'comment', number>

export async function getUserPostTypeFacets(
  userId: string,
  currentUser?: PrivateUser,
): Promise<{ public: UserPostTypeFacets; viewer?: UserPostTypeFacets }> {
  const buildQuery = (viewer?: PrivateUser) =>
    buildPostSearchQuery(viewer, {
      user_id: userId,
      post_types: ['review', 'discussion', 'comment'],
      omitLimit: true,
      omitOrderBy: true,
    })
  const countQuery = sql`/* getUserPostTypeFacets */
    SELECT metric_scope, post_type, COUNT(*) AS total_count
    FROM (
  `
  countQuery.append(sql`SELECT 'public' AS metric_scope, public_posts.post_type FROM (`)
  countQuery.append(buildQuery())
  countQuery.append(sql`) AS public_posts`)
  if (currentUser) {
    countQuery.append(
      sql` UNION ALL SELECT 'viewer' AS metric_scope, viewer_posts.post_type FROM (`,
    )
    countQuery.append(buildQuery(currentUser))
    countQuery.append(sql`) AS viewer_posts`)
  }
  countQuery.append(sql`
    ) AS user_posts
    GROUP BY metric_scope, post_type
  `)
  const { rows } = await executePostSearchQuery(countQuery, false)
  const facets: { public: UserPostTypeFacets; viewer?: UserPostTypeFacets } = {
    public: { review: 0, discussion: 0, comment: 0 },
    ...(currentUser ? { viewer: { review: 0, discussion: 0, comment: 0 } } : {}),
  }
  for (const row of rows as {
    metric_scope: 'public' | 'viewer'
    post_type: keyof UserPostTypeFacets
    total_count: string
  }[]) {
    const counts = row.metric_scope === 'viewer' ? facets.viewer : facets.public
    if (counts) counts[row.post_type] = Number.parseInt(row.total_count, 10)
  }
  return facets
}
