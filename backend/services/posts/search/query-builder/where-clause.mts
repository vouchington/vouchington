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
  // The Hacker News cohort (sort 'new') stays the newest eligible rows so its walk is index-bounded;
  // this filter then trims it in the outer pagination statement.
  if (sort === 'hot') filters.push(sql`posts.votes_score_net > 0`)
  // A materialized eligible cohort already applied these filters in this statement's snapshot.
  if (!paginationOnly) {
    appendBaseFilters(filters, currentUser, options)
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

// A generic prepared plan only proves a partial index predicate when the leading
// equality is a constant. These closed values are the story and data-point indexes.
const POST_TYPE_LITERALS: Readonly<Record<string, () => SQLStatement>> = {
  story: () => sql`posts.post_type = 'story'::post_types`,
  data_point: () => sql`posts.post_type = 'data_point'::post_types`,
}

const VERTICAL_LITERALS: Readonly<Record<string, () => SQLStatement>> = {
  credit_card: () => sql`posts.data_point_vertical = 'credit_card'`,
  bank_account: () => sql`posts.data_point_vertical = 'bank_account'`,
}

const RESULT_LITERALS: Readonly<Record<string, () => SQLStatement>> = {
  approved: () => sql`posts.structured_data->>'result' = 'approved'`,
  denied: () => sql`posts.structured_data->>'result' = 'denied'`,
  pending: () => sql`posts.structured_data->>'result' = 'pending'`,
  counter_offer: () => sql`posts.structured_data->>'result' = 'counter_offer'`,
  retention_offer: () => sql`posts.structured_data->>'result' = 'retention_offer'`,
  sign_up_bonus: () => sql`posts.structured_data->>'result' = 'sign_up_bonus'`,
  offer: () => sql`posts.structured_data->>'result' = 'offer'`,
}

const CREDIT_SCORE_LITERALS: Readonly<Record<string, () => SQLStatement>> = {
  '300-579': () => sql`posts.structured_data->>'credit_score_range' = '300-579'`,
  '580-669': () => sql`posts.structured_data->>'credit_score_range' = '580-669'`,
  '670-739': () => sql`posts.structured_data->>'credit_score_range' = '670-739'`,
  '740-799': () => sql`posts.structured_data->>'credit_score_range' = '740-799'`,
  '800-850': () => sql`posts.structured_data->>'credit_score_range' = '800-850'`,
}

function closedFilter(
  value: string,
  literals: Readonly<Record<string, () => SQLStatement>>,
  parameter: (value: string) => SQLStatement,
): SQLStatement {
  const build = Object.hasOwn(literals, value) ? literals[value] : undefined
  return build ? build() : parameter(value)
}

function appendSimpleColumnFilters(filters: SQLStatement[], options: PostSearchOptions): void {
  const postTypes = options.post_types
  if (postTypes?.length === 1) {
    filters.push(
      closedFilter(postTypes[0], POST_TYPE_LITERALS, value => sql`posts.post_type = ${value}`),
    )
  } else if (postTypes?.length) {
    filters.push(sql`posts.post_type = ANY(${postTypes})`)
  }
  if (options.data_point_vertical) {
    filters.push(
      closedFilter(
        options.data_point_vertical,
        VERTICAL_LITERALS,
        value => sql`posts.data_point_vertical = ${value}`,
      ),
    )
  }
  if (options.data_point_result) {
    filters.push(
      closedFilter(
        options.data_point_result,
        RESULT_LITERALS,
        value => sql`posts.structured_data->>'result' = ${value}`,
      ),
    )
  }
  if (options.data_point_credit_score_range) {
    filters.push(
      closedFilter(
        options.data_point_credit_score_range,
        CREDIT_SCORE_LITERALS,
        value => sql`posts.structured_data->>'credit_score_range' = ${value}`,
      ),
    )
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
