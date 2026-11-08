import { assertNever } from '@modules/utils/assert-never'
import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import type { BasicUser } from '@services/users/types'
import {
  BANK_ACCOUNT_RESULTS,
  CREDIT_CARD_RESULTS,
  CREDIT_SCORE_RANGES,
  DATA_POINT_VERTICALS,
} from '@ts-shared/data-points'
import { VALID_FILTERABLE_POST_TYPES } from '@ts-shared/feed-capabilities'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from '../types.mts'
import { buildPostHasHackerNewsReferences } from '@modules/feed-query-builders'
import { appendBaseFilters } from './base-filters.mts'
import { appendPartitionAndPaginationFilters } from './pagination-filters.mts'
import { appendSearchAndSimilarityFilters } from './search-filters.mts'
import { appendPostSearchSpecialFilters } from './special-filters.mts'
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
    useBoundedCandidates = false,
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
    useBoundedCandidates?: boolean
  },
): void {
  const filters: SQLStatement[] = []
  // The Hacker News cohort (sort 'new') stays the newest eligible rows so its walk is index-bounded;
  // this filter then trims it in the outer pagination statement.
  if (sort === 'hot' || sort === 'trending') filters.push(sql`posts.votes_score_net > 0`)
  // A materialized eligible cohort already applied these filters in this statement's snapshot.
  if (!paginationOnly) {
    appendBaseFilters(filters, currentUser, options, useBoundedCandidates)
    appendTopicFilters(filters, options, useBoundedCandidates)
    appendSimpleColumnFilters(filters, options)
    appendPostSearchSpecialFilters(filters, options, decisionInstant)
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
// equality is a constant. The literals are the enum values, so a new member cannot
// fall through to a parameter.
const CLOSED_LITERAL = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/

function quoteClosedLiteral(value: string): string {
  if (!CLOSED_LITERAL.test(value)) throw new Error(`Closed filter value is not a SQL literal`)
  return `'${value}'`
}

function closedLiterals(
  values: readonly string[],
  predicate: (quoted: string) => string,
): Readonly<Record<string, () => SQLStatement>> {
  return Object.fromEntries(
    values.map(value => {
      const quoted = quoteClosedLiteral(value)
      return [value, () => sql``.append(predicate(quoted))]
    }),
  )
}

function optionValues(...groups: ReadonlyArray<readonly { value: string }[]>): readonly string[] {
  return [...new Set(groups.flatMap(group => group.map(option => option.value)))]
}

const POST_TYPE_LITERALS = closedLiterals(
  VALID_FILTERABLE_POST_TYPES,
  quoted => `posts.post_type = ${quoted}::post_types`,
)
const VERTICAL_LITERALS = closedLiterals(
  optionValues(DATA_POINT_VERTICALS),
  quoted => `posts.data_point_vertical = ${quoted}`,
)
const RESULT_LITERALS = closedLiterals(
  optionValues(CREDIT_CARD_RESULTS, BANK_ACCOUNT_RESULTS),
  quoted => `posts.structured_data->>'result' = ${quoted}`,
)
const CREDIT_SCORE_LITERALS = closedLiterals(
  optionValues(CREDIT_SCORE_RANGES),
  quoted => `posts.structured_data->>'credit_score_range' = ${quoted}`,
)

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
  if (options.profileCountPostType) {
    filters.push(profilePostTypeEquality(options.profileCountPostType))
  } else if (postTypes?.length === 1) {
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

function profilePostTypeEquality(postType: 'review' | 'discussion' | 'comment'): SQLStatement {
  switch (postType) {
    case 'review':
      return sql`posts.post_type = 'review'`
    case 'discussion':
      return sql`posts.post_type = 'discussion'`
    case 'comment':
      return sql`posts.post_type = 'comment'`
    default:
      return assertNever(postType, 'profile count post type')
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
