import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { buildSimpleColumnFilters } from './simple-column-filters.mts'
import { buildBaseFilters } from './base-filters.mts'
import { buildPartitionAndPaginationFilters } from './pagination-filters.mts'
import { buildSearchAndSimilarityFilters } from './search-filters.mts'
import { buildPostSearchSpecialFilters } from './special-filters.mts'
import { buildTopicFilters, buildTopicMembershipFilters } from './topic-filters.mts'

export function appendPostSearchWhereClause(
  query: SQLStatement,
  {
    currentUser,
    paginationOnly = false,
    decisionInstant = new Date(),
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  }: {
    currentUser?: BasicUser
    paginationOnly?: boolean
    decisionInstant?: Date
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    options: PostSearchOptions
    rankingScoreExpression: SQLStatement | null
    sort: string
  },
): void {
  const filters: SQLStatement[] = [
    ...(sort === 'hot' || sort === 'trending' ? [sql`posts.votes_score_net > 0`] : []),
    // Pagination-only statements already applied eligibility inside the same query.
    ...(paginationOnly
      ? []
      : [
          ...buildBaseFilters(currentUser, options),
          ...buildTopicFilters(options),
          ...buildTopicMembershipFilters(options, options.topicMembershipColumn ?? 'posts.id'),
          ...buildSimpleColumnFilters(options),
          ...buildPostSearchSpecialFilters(options, decisionInstant),
          ...buildSearchAndSimilarityFilters({ ...options, hasSemanticSearch, hasTextSearch }),
        ]),
    ...buildPartitionAndPaginationFilters({
      paginationOnly,
      decisionInstant,
      followingRankExpression,
      hasSemanticSearch,
      hasTextSearch,
      options,
      rankingScoreExpression,
      sort,
    }),
  ]
  appendFilters(query, filters)
}

function appendFilters(query: SQLStatement, filters: SQLStatement[]): void {
  if (filters.length === 0) return
  query.append(sql`
    WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql`\n      AND `)
    query.append(filter)
  })
}
