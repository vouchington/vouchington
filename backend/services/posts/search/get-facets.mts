import type { PrivateUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { read } from '@data-stores/psql'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import { buildCountQuery, hasSemanticSearch } from '@modules/search-utils'

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

  const { rows } = await read(countQuery)

  return {
    total_count: Number.parseInt(rows[0]?.total_count || '0', 10),
  }
}
