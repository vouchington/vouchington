import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { write } from '@data-stores/psql'
import { getRequestCurrentUser, setRequestCurrentUser } from '@modules/utils/request-context'
import { getPrivateUserByAny } from './get.mts'
import assert from 'http-assert'
import { validateUsername } from '@modules/utils'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { PrivateUser, UpdateUserOptions } from './types.mts'
import { oauthProviders } from '@services/oauth-accounts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
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

export async function updateUserFields(
  userId: string,
  options: UpdateUserOptions,
  loadedUser?: Pick<PrivateUser, 'username'>,
): Promise<PrivateUser | undefined> {
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
    is_engagement_emails_enabled,
    news_digest_frequency,
    is_moderation_emails_enabled,
    community_digest_frequency,
    moderation_email_cadence,
    moderation_email_days_of_week,
    moderation_email_time_of_day,
    moderation_email_timezone,
    processing_restricted_at,
    should_receive_third_party_marketing,
    should_import_hacker_news_discussions,
    country,
    ui_locale,
    direct_messages_audience,
    is_fediverse_federation_enabled,
  } = options
  let validatedUsername: string | undefined

  if (!hasUserFieldUpdates(options)) return

  if (typeof username === 'string' && username !== '') {
    const existingUser = loadedUser ?? (await getPrivateUserByAny(userId))
    assert(existingUser, 404, 'User not found')
  }

  const query = sql`UPDATE users SET`
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
      const user = loadedUser ?? (await getPrivateUserByAny(userId))
      assert(user?.username, 422, 'Cannot use username as display name source without a username')
    }
    hasSet = appendSet(query, hasSet, sql`use_display_name_from = ${use_display_name_from}`)
  }

  if (typeof username === 'string') {
    validatedUsername = validateUsername(username)
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
    is_engagement_emails_enabled,
    news_digest_frequency,
    is_moderation_emails_enabled,
    community_digest_frequency,
    moderation_email_cadence,
    moderation_email_days_of_week,
    moderation_email_time_of_day,
    moderation_email_timezone,
    processing_restricted_at,
    should_receive_third_party_marketing,
    should_import_hacker_news_discussions,
    is_fediverse_federation_enabled,
  })

  hasSet = appendCountryField(query, hasSet, country)

  hasSet = appendUiLocaleField(query, hasSet, ui_locale)

  if (!hasSet) return

  // view_users_private scans users, so it cannot see this UPDATE in the same statement.
  // RETURNING supplies the replaced username; the private row is the next statement.
  const update = sql`/* updateUserFields */ `
  update.append(query)
  update.append(sql`
    WHERE id = ${userId} AND deleted_at IS NULL
    RETURNING WITH (OLD AS prior) prior.username AS previous_username, id
  `)
  const { rows } = await writeUpdatedUser(update)
  const written = rows[0]
  assert(written, 404, 'User not found')
  const previousUsername = typeof username === 'string' ? written.previous_username : undefined
  const updatedUser = await getPrivateUserByAny(userId, { readOnly: false })
  assert(updatedUser, 404, 'User not found')
  if (getRequestCurrentUser<PrivateUser>()?.id === updatedUser.id)
    setRequestCurrentUser(updatedUser)

  if (typeof username === 'string') {
    void addEntityBloomKeys('users', [normalizeKey(username)])
  }
  const invalidateUser = invalidatesUserMetrics ? invalidate.usersWithMetrics : invalidate.users
  await invalidateUser(userId, previousUsername, validatedUsername)

  void enqueueOnUserUpdated(userId)
  return updatedUser
}

async function writeUpdatedUser(
  query: ReturnType<typeof sql>,
): Promise<{ rows: Array<{ previous_username: string | null; id: string }> }> {
  try {
    return await write<{ previous_username: string | null; id: string }>(query)
  } catch (err) {
    const pgError = err as { code?: string; constraint?: string }
    if (pgError.code === '23505' && pgError.constraint === 'idx_users__username') {
      assert(false, 422, 'Username is already taken')
    }
    throw err
  }
}

function hasUserMetricsVisibilityUpdate(options: UpdateUserOptions): boolean {
  return userMetricsVisibilityFields.some(field => options[field] !== undefined)
}
