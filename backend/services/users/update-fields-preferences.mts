import sql from 'sql-template-strings'
import type { UpdateUserOptions } from './types.mts'
import {
  appendBooleanPreference,
  appendEmailFrequency,
  appendModerationEmailCadence,
  appendModerationEmailDays,
  appendModerationEmailTime,
  appendModerationEmailTimezone,
} from './update-fields-email-preferences.mts'
import {
  appendDefaultPostBroadcast,
  appendDefaultPostPrivacy,
  appendProcessingRestriction,
  appendThirdPartyMarketing,
} from './update-fields-account-preferences.mts'

type UserPreferenceOptions = Pick<
  UpdateUserOptions,
  | 'default_post_broadcast'
  | 'default_post_privacy'
  | 'is_engagement_emails_enabled'
  | 'news_digest_frequency'
  | 'is_moderation_emails_enabled'
  | 'community_digest_frequency'
  | 'moderation_email_cadence'
  | 'moderation_email_days_of_week'
  | 'moderation_email_time_of_day'
  | 'moderation_email_timezone'
  | 'processing_restricted_at'
  | 'should_receive_third_party_marketing'
  | 'is_fediverse_federation_enabled'
>

export function appendUserPreferenceFields(
  query: ReturnType<typeof sql>,
  hasSet: boolean,
  {
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
    is_fediverse_federation_enabled,
  }: UserPreferenceOptions,
): boolean {
  let nextHasSet = appendDefaultPostBroadcast(query, hasSet, default_post_broadcast)
  nextHasSet = appendDefaultPostPrivacy(query, nextHasSet, default_post_privacy)
  nextHasSet = appendBooleanPreference(
    query,
    nextHasSet,
    'is_engagement_emails_enabled',
    is_engagement_emails_enabled,
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
    'is_moderation_emails_enabled',
    is_moderation_emails_enabled,
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
  nextHasSet = appendThirdPartyMarketing(query, nextHasSet, should_receive_third_party_marketing)
  return appendBooleanPreference(
    query,
    nextHasSet,
    'is_fediverse_federation_enabled',
    is_fediverse_federation_enabled,
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
    options.is_engagement_emails_enabled,
    options.news_digest_frequency,
    options.is_moderation_emails_enabled,
    options.community_digest_frequency,
    options.moderation_email_cadence,
    options.moderation_email_days_of_week,
    options.moderation_email_time_of_day,
    options.moderation_email_timezone,
    options.processing_restricted_at,
    options.should_receive_third_party_marketing,
    options.country,
    options.ui_locale,
    options.is_fediverse_federation_enabled,
  ].some(value => value !== undefined)
}
