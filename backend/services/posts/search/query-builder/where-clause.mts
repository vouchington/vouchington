import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { buildPostHasHackerNewsReferences } from '@modules/feed-query-builders'
import { appendBaseFilters } from './base-filters.mts'
import { appendPartitionAndPaginationFilters } from './pagination-filters.mts'
import { appendSearchAndSimilarityFilters } from './search-filters.mts'
import { appendTopicFilters } from './topic-filters.mts'

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
  const filters: SQLStatement[] = []
  // A materialized eligible cohort already applied these filters in this statement's snapshot.
  if (!paginationOnly) {
    appendBaseFilters(filters, currentUser, options)
    if (options.sort === 'hot') filters.push(sql`posts.votes_score_net > 0`)
    appendTopicFilters(filters, options)
    appendSimpleColumnFilters(filters, options)
    appendSearchAndSimilarityFilters(filters, { ...options, hasSemanticSearch, hasTextSearch })
  }
  appendPartitionAndPaginationFilters(filters, {
    paginationOnly,
    decisionInstant,
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
      FROM story_posts
      WHERE story_posts.post_id = posts.id
        AND story_posts.story_id = ${options.story_id}
    )`)
  }
  if (areHackerNewsReferencesVisible() && options.has_hacker_news_references !== undefined) {
    const references = buildPostHasHackerNewsReferences()
    filters.push(options.has_hacker_news_references ? references : sql`NOT `.append(references))
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
