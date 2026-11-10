import sql, { type SQLStatement } from 'sql-template-strings'
import type { BasicUser } from '@services/users/types'
import type { PostSearchOptions } from '../types.mts'
import { getPostsWorkLimit } from '../../work-limits.mts'
import { buildPostSearchTimeRangeFilter } from '../hacker-news-hot-options.mts'
import { appendPostSearchSelectAndJoins } from './select-and-joins.mts'
import { appendPostSearchWhereClause } from './where-clause.mts'
import { appendPostSearchOrderAndLimit } from './order-and-limit.mts'

/** Fix newest raw keys before eligibility and ranking; later pages cannot expand the cohort. */
export function buildHackerNewsHotCandidates(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  hasTextSearch: boolean,
  hasSemanticSearch: boolean,
  rankingScoreExpression: SQLStatement | null,
  decisionInstant: Date,
): SQLStatement {
  const query = sql``
  if (!hasSemanticSearch) {
    const cap = getPostsWorkLimit('hacker_news_hot_candidate_limit')
    if (!Number.isSafeInteger(cap) || cap < 1) throw new Error('Invalid Hacker News cohort limit')
    query.append(sql`bounded_post_search_candidates AS (
      SELECT posts.id FROM posts WHERE `)
    const window = buildPostSearchTimeRangeFilter(options, 'posts.id', decisionInstant)
    if (!window) throw new Error('Hacker News hot requires a time window')
    query
      .append(window)
      .append(sql` ORDER BY posts.id DESC LIMIT `)
      .append(String(cap))
    query.append(sql`
    ), `)
  }
  query.append(sql`hacker_news_hot_candidates AS (`)
  const context = {
    decisionInstant,
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
    rankingScoreExpression,
    sort: 'new' as const,
  }
  appendPostSearchSelectAndJoins(query, {
    ...context,
    includeHotCandidateColumns: true,
    useSemanticCandidates: hasSemanticSearch,
    useBoundedCandidates: !hasSemanticSearch,
  })
  appendPostSearchWhereClause(query, { ...context, useBoundedCandidates: !hasSemanticSearch })
  appendPostSearchOrderAndLimit(query, {
    ...context,
    limit: getPostsWorkLimit('hacker_news_hot_candidate_limit'),
    omitLimit: false,
    omitOrderBy: false,
  })
  return query.append(sql`)`)
}
