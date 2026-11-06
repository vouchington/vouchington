import sql, { type SQLStatement } from 'sql-template-strings'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions } from '../types.mts'
import { getPostsWorkLimit } from '../../work-limits.mts'
import { appendPostSearchSelectAndJoins } from './select-and-joins.mts'
import { appendPostSearchWhereClause } from './where-clause.mts'
import { appendPostSearchOrderAndLimit } from './order-and-limit.mts'

/** Fix the newest eligible cohort before scoring or pagination; later pages cannot expand it. */
export function buildHackerNewsHotCandidates(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  hasTextSearch: boolean,
  hasSemanticSearch: boolean,
): SQLStatement {
  const query = sql`hacker_news_hot_candidates AS MATERIALIZED (`
  const context = {
    currentUser,
    followingRankExpression: null,
    hasSemanticSearch,
    hasTextSearch,
    options: {
      ...options,
      after: undefined,
      id_lt: undefined,
      ranking_lt: undefined,
      vote_score_lt: undefined,
      hot_score_lt: undefined,
    },
    rankingScoreExpression: null,
    sort: 'new' as const,
  }
  appendPostSearchSelectAndJoins(query, { ...context, useSemanticCandidates: hasSemanticSearch })
  appendPostSearchWhereClause(query, context)
  appendPostSearchOrderAndLimit(query, {
    ...context,
    limit: getPostsWorkLimit('hacker_news_hot_candidate_limit'),
    omitLimit: false,
    omitOrderBy: false,
  })
  return query.append(sql`)`)
}
