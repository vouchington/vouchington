import { isValidPrivacyAudience } from './privacy.mts'
import type { UpdateUserOptions } from './types.mts'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'

type UserUpdateQuery = ReturnType<typeof sql>

export function appendVisibilityFields(
  query: UserUpdateQuery,
  initialHasSet: boolean,
  fields: Pick<
    UpdateUserOptions,
    | 'cards_visibility'
    | 'community_memberships_visibility'
    | 'direct_messages_audience'
    | 'followers_visibility'
    | 'follows_visibility'
    | 'likes_visibility'
    | 'rewards_program_statuses_visibility'
    | 'rss_feed_follows_visibility'
    | 'spending_categories_visibility'
    | 'topic_follows_visibility'
  >,
) {
  let hasSet = initialHasSet
  for (const [column, value] of visibilityEntries(fields)) {
    if (value === undefined) continue
    assert(isValidPrivacyAudience(value), 422, `Invalid ${column} value`)
    hasSet = appendSet(query, hasSet, visibilityAssignment(column, value))
  }

  return hasSet
}

export function appendSet(query: UserUpdateQuery, hasSet: boolean, assignment: SQLStatement) {
  query.append(hasSet ? sql`, ` : sql` `)
  query.append(assignment)
  return true
}

function visibilityEntries(
  fields: Parameters<typeof appendVisibilityFields>[2],
): ReadonlyArray<readonly [(typeof visibilityFieldNames)[number], string | undefined]> {
  return [
    ['cards_visibility', fields.cards_visibility],
    ['rewards_program_statuses_visibility', fields.rewards_program_statuses_visibility],
    ['spending_categories_visibility', fields.spending_categories_visibility],
    ['follows_visibility', fields.follows_visibility],
    ['topic_follows_visibility', fields.topic_follows_visibility],
    ['rss_feed_follows_visibility', fields.rss_feed_follows_visibility],
    ['community_memberships_visibility', fields.community_memberships_visibility],
    ['followers_visibility', fields.followers_visibility],
    ['likes_visibility', fields.likes_visibility],
    ['direct_messages_audience', fields.direct_messages_audience],
  ]
}

function visibilityAssignment(column: (typeof visibilityFieldNames)[number], value: string) {
  switch (column) {
    case 'cards_visibility':
      return sql`cards_visibility = ${value}`
    case 'community_memberships_visibility':
      return sql`community_memberships_visibility = ${value}`
    case 'direct_messages_audience':
      return sql`direct_messages_audience = ${value}`
    case 'followers_visibility':
      return sql`followers_visibility = ${value}`
    case 'follows_visibility':
      return sql`follows_visibility = ${value}`
    case 'likes_visibility':
      return sql`likes_visibility = ${value}`
    case 'rewards_program_statuses_visibility':
      return sql`rewards_program_statuses_visibility = ${value}`
    case 'rss_feed_follows_visibility':
      return sql`rss_feed_follows_visibility = ${value}`
    case 'spending_categories_visibility':
      return sql`spending_categories_visibility = ${value}`
    case 'topic_follows_visibility':
      return sql`topic_follows_visibility = ${value}`
  }
}

const visibilityFieldNames = [
  'cards_visibility',
  'community_memberships_visibility',
  'direct_messages_audience',
  'followers_visibility',
  'follows_visibility',
  'likes_visibility',
  'rewards_program_statuses_visibility',
  'rss_feed_follows_visibility',
  'spending_categories_visibility',
  'topic_follows_visibility',
] as const
