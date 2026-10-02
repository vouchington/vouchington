import type { EmailPreferences, UpdateUserOptions } from '@services/users'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { componentPropertySchema, componentSchema } from './route-response-schema.mts'

const FREQUENCY = { type: 'string', enum: ['none', 'daily', 'weekly'] }

export type EmailPreferencesToolArgs = Partial<EmailPreferences>

/** The email preferences a user can change, as PATCH /api/v1/my/email-preferences takes them. */
export const EMAIL_PREFERENCES_PARAMETERS = {
  type: 'object',
  properties: {
    engagement_emails_enabled: {
      type: 'boolean',
      description: 'Whether to receive setup recommendation emails.',
    },
    news_digest_frequency: { ...FREQUENCY, description: 'How often to receive the news digest.' },
    moderation_emails_enabled: {
      type: 'boolean',
      description: 'Whether to receive community moderation summary emails.',
    },
    community_digest_frequency: {
      ...FREQUENCY,
      description: 'How often to receive the community digest.',
    },
    moderation_email_cadence: {
      type: 'string',
      enum: ['daily', 'selected_days', 'weekly'],
      description: 'How often to receive moderation summaries.',
    },
    moderation_email_days_of_week: {
      type: 'array',
      items: { type: 'integer', minimum: 1, maximum: 7 },
      minItems: 1,
      maxItems: 7,
      description: 'The weekdays for moderation summaries, from 1 to 7. Used by selected_days.',
    },
    moderation_email_time_of_day: {
      type: 'string',
      pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
      description: 'The time of day for moderation summaries, as HH:MM.',
    },
    moderation_email_timezone: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'An IANA time zone name for the time of day, such as America/New_York.',
    },
  },
  minProperties: 1,
  additionalProperties: false,
}

export const EMAIL_PREFERENCES_RESULT_SCHEMA = successSchema({
  email_preferences: componentSchema('EmailPreferences'),
})

/**
 * The settings the preferences tool can change, each one a field of PATCH /api/v1/users/:idOrSlug.
 * Financial-data visibility, consents, federation, processing restriction and the username are
 * deliberately not here: see docs/overview/architecture/agent-tools/profile-notification-write-tools.md.
 */
export const SETTING_FIELDS = [
  'follows_visibility',
  'topic_follows_visibility',
  'rss_feed_follows_visibility',
  'community_memberships_visibility',
  'followers_visibility',
  'likes_visibility',
  'direct_messages_audience',
  'default_post_broadcast',
  'default_post_privacy',
  'country',
  'ui_locale',
  'hn_discussions',
] as const satisfies readonly (keyof UpdateUserOptions)[]

export type SettingField = (typeof SETTING_FIELDS)[number]
export type SettingsToolArgs = Pick<UpdateUserOptions, SettingField>

const setting = (field: SettingField) => componentPropertySchema('UpdateUserOptions', field)
const audience = (what: string) => ({ ...setting('follows_visibility'), description: what })

export const SETTINGS_PARAMETERS = {
  type: 'object',
  properties: {
    follows_visibility: audience('Who can see the users the current user follows.'),
    topic_follows_visibility: audience('Who can see the topics the current user follows.'),
    rss_feed_follows_visibility: audience('Who can see the RSS feeds the current user follows.'),
    community_memberships_visibility: audience(
      'Who can see the communities the current user belongs to.',
    ),
    followers_visibility: audience('Who can see the current user’s followers.'),
    likes_visibility: audience('Who can see the current user’s likes.'),
    direct_messages_audience: audience('Who can send the current user a direct message.'),
    default_post_broadcast: {
      ...setting('default_post_broadcast'),
      description: 'Who a new post is shown to unless the post says otherwise.',
    },
    default_post_privacy: {
      ...setting('default_post_privacy'),
      description: 'Whether a new post is public or private unless the post says otherwise.',
    },
    country: {
      ...setting('country'),
      description: 'An ISO 3166-1 alpha-2 country code, or null to clear it.',
    },
    ui_locale: {
      ...setting('ui_locale'),
      description: 'A supported interface locale, or null to use the default.',
    },
    hn_discussions: {
      type: 'boolean',
      description: 'Whether post and article pages show related Hacker News discussions.',
    },
  },
  minProperties: 1,
  additionalProperties: false,
}

// The users route returns the whole private user. The tool returns every setting it can change, as
// that body spells each one.
export const SETTINGS_RESULT_SCHEMA = successSchema({
  settings: objectSchema(Object.fromEntries(SETTING_FIELDS.map(field => [field, setting(field)]))),
})
