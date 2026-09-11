import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { write } from '@data-stores/psql'
import { getPrivateUserByAny } from './get.mts'
import assert from 'http-assert'
import { validateUsername } from '@modules/utils'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { UpdateUserOptions } from './types.mts'
import { oauthProviders } from '@services/oauth-accounts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'
import { appendSet, appendVisibilityFields } from './update-fields-visibility.mts'
import { appendCountryField, appendUiLocaleField } from './update-fields-locale.mts'
import { appendUserPreferenceFields, hasUserFieldUpdates } from './update-fields-preferences.mts'

const userMetricsVisibilityFields = [
  'community_memberships_visibility',
  'followers_visibility',
  'follows_visibility',
  'rss_feed_follows_visibility',
  'topic_follows_visibility',
] as const satisfies ReadonlyArray<keyof UpdateUserOptions>

export async function updateUserFields(userId: string, options: UpdateUserOptions) {
  const invalidatesUserMetrics = hasUserMetricsVisibilityUpdate(options)
  const {
    username,
    use_display_name_from,
    cards_visibility,
    rewards_program_statuses_visibility,
    spending_categories_visibility,
    follows_visibility,
    topic_follows_visibility,
    rss_feed_follows_visibility,
    community_memberships_visibility,
    followers_visibility,
    likes_visibility,
    default_post_broadcast,
    default_post_privacy,
    engagement_emails_enabled,
    news_digest_frequency,
    moderation_emails_enabled,
    community_digest_frequency,
    moderation_email_cadence,
    moderation_email_days_of_week,
    moderation_email_time_of_day,
    moderation_email_timezone,
    processing_restricted_at,
    third_party_marketing,
    hn_discussions,
    country,
    ui_locale,
    direct_messages_audience,
    fediverse_federation_enabled,
  } = options
  let previousUsername: string | null | undefined
  let validatedUsername: string | undefined

  if (!hasUserFieldUpdates(options)) return

  if (typeof username === 'string' && username !== '') {
    const existingUser = await getPrivateUserByAny(userId)
    assert(existingUser, 404, 'User not found')
    previousUsername = existingUser.username
  }

  const query = sql`/* updateUserFields */ UPDATE users SET`
  let hasSet = false

  // Only validate and set if provided and not empty (empty strings are ignored)
  if (use_display_name_from !== undefined && use_display_name_from !== '') {
    assert(typeof use_display_name_from === 'string', 422, 'use_display_name_from invalid')
    const validDisplayNameSources = ['username', ...oauthProviders]
    assert(
      validDisplayNameSources.includes(use_display_name_from),
      422,
      `use_display_name_from must be one of: ${validDisplayNameSources.join(', ')}`,
    )
    if (use_display_name_from === 'username' && username === undefined) {
      const user = await getPrivateUserByAny(userId)
      assert(user?.username, 422, 'Cannot use username as display name source without a username')
    }
    hasSet = appendSet(query, hasSet, sql`use_display_name_from = ${use_display_name_from}`)
  }

  if (typeof username === 'string') {
    validatedUsername = validateUsername(username)
    const existing = await getPrivateUserByAny(validatedUsername)
    assert(!existing || existing.id === userId, 422, 'Username is already taken')
    hasSet = appendSet(query, hasSet, sql`username = ${validatedUsername}`)
  }

  hasSet = appendVisibilityFields(query, hasSet, {
    cards_visibility,
    community_memberships_visibility,
    direct_messages_audience,
    followers_visibility,
    follows_visibility,
    likes_visibility,
    rewards_program_statuses_visibility,
    rss_feed_follows_visibility,
    spending_categories_visibility,
    topic_follows_visibility,
  })

  hasSet = appendUserPreferenceFields(query, hasSet, {
    default_post_broadcast,
    default_post_privacy,
    engagement_emails_enabled,
    news_digest_frequency,
    moderation_emails_enabled,
    community_digest_frequency,
    moderation_email_cadence,
    moderation_email_days_of_week,
    moderation_email_time_of_day,
    moderation_email_timezone,
    processing_restricted_at,
    third_party_marketing,
    hn_discussions,
    fediverse_federation_enabled,
  })

  hasSet = appendCountryField(query, hasSet, country)

  hasSet = appendUiLocaleField(query, hasSet, ui_locale)

  if (!hasSet) return

  query.append(sql` WHERE id = ${userId} AND deleted_at IS NULL`)

  await write(query)

  if (typeof username === 'string') {
    entityCacheBloomFilters.users.add([normalizeKey(username)])
  }
  await Promise.all([
    invalidate.users(userId, previousUsername, validatedUsername),
    invalidatesUserMetrics
      ? invalidate.user_metrics(userId, previousUsername, validatedUsername)
      : Promise.resolve(),
  ])

  void enqueueOnUserUpdated(userId)
}

function hasUserMetricsVisibilityUpdate(options: UpdateUserOptions): boolean {
  return userMetricsVisibilityFields.some(field => options[field] !== undefined)
}
