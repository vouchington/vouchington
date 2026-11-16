import { assertNever } from '@modules/utils/assert-never'
import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
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
  [...VALID_FILTERABLE_POST_TYPES, 'topic_recommendation'],
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

function buildPostTypeFilters(options: PostSearchOptions): SQLStatement[] {
  const postTypes = options.post_types
  if (options.profileCountPostType) return [profilePostTypeEquality(options.profileCountPostType)]
  if (postTypes?.length === 1) {
    return [
      closedFilter(postTypes[0], POST_TYPE_LITERALS, value => sql`posts.post_type = ${value}`),
    ]
  }
  if (postTypes?.length) return [sql`posts.post_type = ANY(${postTypes})`]
  return []
}

export function buildSimpleColumnFilters(options: PostSearchOptions): SQLStatement[] {
  return [
    ...buildPostTypeFilters(options),
    ...(options.data_point_vertical
      ? [
          closedFilter(
            options.data_point_vertical,
            VERTICAL_LITERALS,
            value => sql`posts.data_point_vertical = ${value}`,
          ),
        ]
      : []),
    ...(options.data_point_result
      ? [
          closedFilter(
            options.data_point_result,
            RESULT_LITERALS,
            value => sql`posts.structured_data->>'result' = ${value}`,
          ),
        ]
      : []),
    ...(options.data_point_credit_score_range
      ? [
          closedFilter(
            options.data_point_credit_score_range,
            CREDIT_SCORE_LITERALS,
            value => sql`posts.structured_data->>'credit_score_range' = ${value}`,
          ),
        ]
      : []),
    // The positive result and credit indexes cover global data points only.
    ...(options.data_point_result || options.data_point_credit_score_range
      ? [sql`posts.community_id IS NULL`]
      : []),
    ...(options.story_id
      ? [
          sql`EXISTS (
      SELECT 1
      FROM story_posts
      WHERE story_posts.post_id = posts.id
        AND story_posts.story_id = ${options.story_id}
    )`,
        ]
      : []),
    ...buildPostHasHackerNewsReferencesFilters(options),
  ]
}

function buildPostHasHackerNewsReferencesFilters(options: PostSearchOptions): SQLStatement[] {
  if (!areHackerNewsReferencesVisible() || options.has_hacker_news_references === undefined) {
    return []
  }
  const references = buildPostHasHackerNewsReferences()
  return [options.has_hacker_news_references ? references : sql`NOT `.append(references)]
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
