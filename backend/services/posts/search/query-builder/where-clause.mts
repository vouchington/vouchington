import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { appendBaseFilters } from './base-filters.mts'
import { appendPartitionAndPaginationFilters } from './pagination-filters.mts'
import { appendSearchAndSimilarityFilters } from './search-filters.mts'
import { appendTopicFilters } from './topic-filters.mts'

export function appendPostSearchWhereClause(
  query: SQLStatement,
  {
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  }: {
    currentUser?: BasicUser
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    options: PostSearchOptions
    rankingScoreExpression: SQLStatement | null
    sort: string
  },
): void {
  const filters: SQLStatement[] = []
  appendBaseFilters(filters, currentUser, options)
  appendTopicFilters(filters, options)
  appendSimpleColumnFilters(filters, options)
  appendSearchAndSimilarityFilters(filters, { ...options, hasSemanticSearch, hasTextSearch })
  appendPartitionAndPaginationFilters(filters, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
  appendFilters(query, filters)
}

function appendSimpleColumnFilters(filters: SQLStatement[], options: PostSearchOptions): void {
  if (options.post_types?.length) filters.push(sql`posts.post_type = ANY(${options.post_types})`)
  if (options.data_point_vertical) {
    filters.push(sql`posts.data_point_vertical = ${options.data_point_vertical}`)
  }
  if (options.story_id) {
    filters.push(sql`EXISTS (
      SELECT 1
      FROM post__stories
      WHERE post__stories.post_id = posts.id
        AND post__stories.story_id = ${options.story_id}
    )`)
  }
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
