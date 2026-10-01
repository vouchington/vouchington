import sql, { type SQLStatement } from 'sql-template-strings'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions } from '../types.mts'
import { appendPostSearchSelectAndJoins } from './select-and-joins.mts'
import { appendPostSearchWhereClause } from './where-clause.mts'

export const SEMANTIC_POST_CANDIDATE_LIMIT = 1000

/** Filter before the nearest-neighbour window; apply page cursors only outside it. */
export function buildSemanticPostCandidates(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  hasTextSearch: boolean,
): SQLStatement {
  const query = sql`semantic_post_candidates AS MATERIALIZED (
    SELECT semantic_eligible_post.id, semantic_eligible_post.post_type
    FROM posts semantic_vector_post
    CROSS JOIN semantic_search_embedding
    CROSS JOIN LATERAL (`
  const candidateOptions = {
    ...options,
    after: undefined,
    id_lt: undefined,
    ranking_lt: undefined,
    vote_score_lt: undefined,
    hot_score_lt: undefined,
  }
  const context = {
    currentUser,
    followingRankExpression: null,
    hasSemanticSearch: true,
    hasTextSearch,
    options: candidateOptions,
    rankingScoreExpression: null,
    sort: 'new',
  }
  appendPostSearchSelectAndJoins(query, context)
  appendPostSearchWhereClause(query, context)
  query.append(sql`
    AND posts.id = semantic_vector_post.id
      LIMIT 1
    ) semantic_eligible_post
    WHERE semantic_vector_post.bedrock_nova_multimodal_v1_embedding IS NOT NULL
    ORDER BY semantic_vector_post.bedrock_nova_multimodal_v1_embedding <=>
      semantic_search_embedding.embedding
    LIMIT ${SEMANTIC_POST_CANDIDATE_LIMIT}
  )`)
  return query
}
