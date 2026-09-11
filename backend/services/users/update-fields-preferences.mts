/* oxlint-disable max-lines -- User preference update helpers are kept together because update-fields.mts builds one SQL UPDATE statement from these appenders. */
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { UpdateUserOptions } from './types.mts'
import { appendSet } from './update-fields-visibility.mts'

type UserPreferenceOptions = Pick<
  UpdateUserOptions,
  | 'default_post_broadcast'
  | 'default_post_privacy'
  | 'engagement_emails_enabled'
  | 'news_digest_frequency'
  | 'moderation_emails_enabled'
  | 'community_digest_frequency'
  | 'moderation_email_cadence'
  | 'moderation_email_days_of_week'
  | 'moderation_email_time_of_day'
  | 'moderation_email_timezone'
  | 'processing_restricted_at'
  | 'third_party_marketing'
  | 'hn_discussions'
  | 'fediverse_federation_enabled'
>

export function appendUserPreferenceFields(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  {
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
  }: UserPreferenceOptions,
): boolean {
  let nextHasSet = appendDefaultPostBroadcast(query, hasSet, default_post_broadcast)
  nextHasSet = appendDefaultPostPrivacy(query, nextHasSet, default_post_privacy)
  nextHasSet = appendBooleanPreference(
    query,
    nextHasSet,
    'engagement_emails_enabled',
    engagement_emails_enabled,
  )
  nextHasSet = appendEmailFrequency(
    query,
    nextHasSet,
    'news_digest_frequency',
    news_digest_frequency,
  )
  nextHasSet = appendBooleanPreference(
    query,
    nextHasSet,
    'moderation_emails_enabled',
    moderation_emails_enabled,
  )
  nextHasSet = appendEmailFrequency(
    query,
    nextHasSet,
    'community_digest_frequency',
    community_digest_frequency,
  )
  nextHasSet = appendModerationEmailCadence(query, nextHasSet, moderation_email_cadence)
  nextHasSet = appendModerationEmailDays(query, nextHasSet, moderation_email_days_of_week)
  nextHasSet = appendModerationEmailTime(query, nextHasSet, moderation_email_time_of_day)
  nextHasSet = appendModerationEmailTimezone(query, nextHasSet, moderation_email_timezone)
  nextHasSet = appendProcessingRestriction(query, nextHasSet, processing_restricted_at)
  nextHasSet = appendThirdPartyMarketing(query, nextHasSet, third_party_marketing)
  nextHasSet = appendHnDiscussions(query, nextHasSet, hn_discussions)
  return appendBooleanPreference(
    query,
    nextHasSet,
    'fediverse_federation_enabled',
    fediverse_federation_enabled,
  )
}

export function hasUserFieldUpdates(options: UpdateUserOptions): boolean {
  return [
    options.use_display_name_from,
    options.username,
    options.cards_visibility,
    options.rewards_program_statuses_visibility,
    options.spending_categories_visibility,
    options.follows_visibility,
    options.topic_follows_visibility,
    options.rss_feed_follows_visibility,
    options.community_memberships_visibility,
    options.followers_visibility,
    options.likes_visibility,
    options.direct_messages_audience,
    options.default_post_broadcast,
    options.default_post_privacy,
    options.engagement_emails_enabled,
    options.news_digest_frequency,
    options.moderation_emails_enabled,
    options.community_digest_frequency,
    options.moderation_email_cadence,
    options.moderation_email_days_of_week,
    options.moderation_email_time_of_day,
    options.moderation_email_timezone,
    options.processing_restricted_at,
    options.third_party_marketing,
    options.hn_discussions,
    options.country,
    options.ui_locale,
    options.fediverse_federation_enabled,
  ].some(value => value !== undefined)
}

function appendEmailFrequency(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  field: 'news_digest_frequency' | 'community_digest_frequency',
  value:
    | UpdateUserOptions['news_digest_frequency']
    | UpdateUserOptions['community_digest_frequency'],
): boolean {
  if (value === undefined) return hasSet
  assert(
    value === 'none' || value === 'daily' || value === 'weekly',
    422,
    `${field} must be none, daily, or weekly`,
  )
  const set =
    field === 'news_digest_frequency'
      ? sql`news_digest_frequency = ${value}`
      : sql`community_digest_frequency = ${value}`
  return appendSet(query, hasSet, set)
}

function appendBooleanPreference(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  field: 'engagement_emails_enabled' | 'moderation_emails_enabled' | 'fediverse_federation_enabled',
  value: boolean | undefined,
): boolean {
  if (value === undefined) return hasSet
  assert(typeof value === 'boolean', 422, `${field} must be a boolean`)
  const set =
    field === 'engagement_emails_enabled'
      ? sql`engagement_emails_enabled = ${value}`
      : field === 'moderation_emails_enabled'
        ? sql`moderation_emails_enabled = ${value}`
        : sql`fediverse_federation_enabled = ${value}`
  return appendSet(query, hasSet, set)
}

function appendModerationEmailCadence(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  cadence: UpdateUserOptions['moderation_email_cadence'],
): boolean {
  if (cadence === undefined) return hasSet
  assert(
    cadence === 'daily' || cadence === 'selected_days' || cadence === 'weekly',
    422,
    'Invalid moderation_email_cadence value',
  )
  return appendSet(query, hasSet, sql`moderation_email_cadence = ${cadence}`)
}

function appendModerationEmailDays(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  days: UpdateUserOptions['moderation_email_days_of_week'],
): boolean {
  if (days === undefined) return hasSet
  assert(Array.isArray(days), 422, 'moderation_email_days_of_week must be an array')
  assert(days.length > 0, 422, 'moderation_email_days_of_week cannot be empty')
  assert(
    days.every(day => Number.isInteger(day) && day >= 1 && day <= 7),
    422,
    'moderation_email_days_of_week values must be integers between 1 and 7',
  )
  const normalizedDays = [...new Set(days)].toSorted((a, b) => a - b)
  return appendSet(
    query,
    hasSet,
    sql`moderation_email_days_of_week = ${normalizedDays}::SMALLINT[]`,
  )
}

function appendModerationEmailTime(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  timeOfDay: UpdateUserOptions['moderation_email_time_of_day'],
): boolean {
  if (timeOfDay === undefined) return hasSet
  assert(
    typeof timeOfDay === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay),
    422,
    'moderation_email_time_of_day must be HH:MM',
  )
  return appendSet(query, hasSet, sql`moderation_email_time_of_day = ${timeOfDay}`)
}

function appendModerationEmailTimezone(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  timezone: UpdateUserOptions['moderation_email_timezone'],
): boolean {
  if (timezone === undefined) return hasSet
  assert(
    typeof timezone === 'string' &&
      timezone.length > 0 &&
      timezone.length <= 64 &&
      isValidTimeZone(timezone),
    422,
    'moderation_email_timezone must be a valid timezone string',
  )
  return appendSet(query, hasSet, sql`moderation_email_timezone = ${timezone}`)
}

function appendDefaultPostBroadcast(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  defaultPostBroadcast: UpdateUserOptions['default_post_broadcast'],
): boolean {
  if (defaultPostBroadcast === undefined) return hasSet
  const validBroadcasts = ['everyone', 'users', 'followers', 'mutual_followers']
  assert(
    validBroadcasts.includes(defaultPostBroadcast),
    422,
    'Invalid default_post_broadcast value',
  )
  return appendSet(query, hasSet, sql`default_post_broadcast = ${defaultPostBroadcast}`)
}

function appendDefaultPostPrivacy(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  defaultPostPrivacy: UpdateUserOptions['default_post_privacy'],
): boolean {
  if (defaultPostPrivacy === undefined) return hasSet
  assert(
    defaultPostPrivacy === 'public' || defaultPostPrivacy === 'private',
    422,
    'Invalid default_post_privacy value',
  )
  return appendSet(query, hasSet, sql`default_post_privacy = ${defaultPostPrivacy}`)
}

function appendProcessingRestriction(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  processingRestrictedAt: UpdateUserOptions['processing_restricted_at'],
): boolean {
  if (processingRestrictedAt === undefined) return hasSet
  assert(
    typeof processingRestrictedAt === 'boolean',
    422,
    'processing_restricted_at must be a boolean',
  )
  const set = processingRestrictedAt
    ? sql`processing_restricted_at = CURRENT_TIMESTAMP`
    : sql`processing_restricted_at = NULL`
  return appendSet(query, hasSet, set)
}

function appendThirdPartyMarketing(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  thirdPartyMarketing: UpdateUserOptions['third_party_marketing'],
): boolean {
  if (thirdPartyMarketing === undefined) return hasSet
  assert(typeof thirdPartyMarketing === 'boolean', 422, 'third_party_marketing must be a boolean')
  return appendSet(query, hasSet, sql`third_party_marketing = ${thirdPartyMarketing}`)
}

function appendHnDiscussions(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  hnDiscussions: UpdateUserOptions['hn_discussions'],
): boolean {
  if (hnDiscussions === undefined) return hasSet
  assert(typeof hnDiscussions === 'boolean', 422, 'hn_discussions must be a boolean')
  return appendSet(query, hasSet, sql`hn_discussions = ${hnDiscussions}`)
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    getTimeZoneFormatter(timeZone).format()
    return true
  } catch {
    return false
  }
}

const timeZoneFormatters = new Map<string, Intl.DateTimeFormat>()

function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = timeZoneFormatters.get(timeZone)
  if (existing) return existing
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone })
  timeZoneFormatters.set(timeZone, formatter)
  return formatter
}
