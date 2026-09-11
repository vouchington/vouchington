import assert from 'http-assert'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { getSiteUrl } from '@modules/utils'
import { updateUserFields } from './update-fields.mts'
import type { UpdateUserOptions, UserPrivacySettings } from './types.mts'
import { getUserPrivacySettings } from './privacy.mts'

const UNSUBSCRIBE_PURPOSE = 'email-unsubscribe-token'

export type EmailUnsubscribeCategory = 'outcome_emails' | 'news_digest' | 'community_digest'

type EmailUnsubscribeTokenPayload = {
  userId: string
  category: EmailUnsubscribeCategory
}

export type EmailPreferences = Pick<
  UserPrivacySettings,
  | 'engagement_emails_enabled'
  | 'news_digest_frequency'
  | 'moderation_emails_enabled'
  | 'community_digest_frequency'
  | 'moderation_email_cadence'
  | 'moderation_email_days_of_week'
  | 'moderation_email_time_of_day'
  | 'moderation_email_timezone'
>

export async function getEmailPreferences(userId: string): Promise<EmailPreferences> {
  const settings = await getUserPrivacySettings(userId)
  return toEmailPreferences(settings)
}

export async function updateEmailPreferences(
  userId: string,
  preferences: Partial<EmailPreferences>,
): Promise<EmailPreferences> {
  await updateUserFields(userId, toUpdateUserOptions(preferences))
  return getEmailPreferences(userId)
}

export function createEmailUnsubscribeToken(
  userId: string,
  category: EmailUnsubscribeCategory,
): string {
  return encryptSecret(JSON.stringify({ userId, category }), UNSUBSCRIBE_PURPOSE)
}

export function createEmailUnsubscribeUrl(
  userId: string,
  category: EmailUnsubscribeCategory,
): string {
  const token = createEmailUnsubscribeToken(userId, category)
  return getSiteUrl(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
}

export function createListUnsubscribeHeaders(
  userId: string,
  category: EmailUnsubscribeCategory,
): Record<string, string> {
  const token = createEmailUnsubscribeToken(userId, category)
  return {
    'List-Unsubscribe': `<${getSiteUrl(
      `/api/v1/email-unsubscribe?token=${encodeURIComponent(token)}`,
    )}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

export async function unsubscribeEmailToken(token: string): Promise<EmailPreferences> {
  const payload = parseEmailUnsubscribeToken(token)
  await unsubscribeEmailCategory(payload.userId, payload.category)
  return getEmailPreferences(payload.userId)
}

export async function unsubscribeEmailCategory(
  userId: string,
  category: EmailUnsubscribeCategory,
): Promise<void> {
  if (category === 'outcome_emails') {
    await updateUserFields(userId, { engagement_emails_enabled: false })
    return
  }
  if (category === 'news_digest') {
    await updateUserFields(userId, { news_digest_frequency: 'none' })
    return
  }
  await updateUserFields(userId, {
    moderation_emails_enabled: false,
    community_digest_frequency: 'none',
  })
}

function parseEmailUnsubscribeToken(token: string): EmailUnsubscribeTokenPayload {
  assert(typeof token === 'string' && token.length > 0, 400, 'Unsubscribe token is required')
  let payload: unknown
  try {
    payload = JSON.parse(decryptSecret(token, UNSUBSCRIBE_PURPOSE))
  } catch {
    assert(false, 400, 'Invalid unsubscribe token')
  }
  assert(isEmailUnsubscribeTokenPayload(payload), 400, 'Invalid unsubscribe token')
  return payload
}

function isEmailUnsubscribeTokenPayload(value: unknown): value is EmailUnsubscribeTokenPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<EmailUnsubscribeTokenPayload>
  return (
    typeof payload.userId === 'string' &&
    (payload.category === 'outcome_emails' ||
      payload.category === 'news_digest' ||
      payload.category === 'community_digest')
  )
}

function toEmailPreferences(settings: UserPrivacySettings): EmailPreferences {
  return {
    engagement_emails_enabled: settings.engagement_emails_enabled,
    news_digest_frequency: settings.news_digest_frequency,
    moderation_emails_enabled: settings.moderation_emails_enabled,
    community_digest_frequency: settings.community_digest_frequency,
    moderation_email_cadence: settings.moderation_email_cadence,
    moderation_email_days_of_week: settings.moderation_email_days_of_week,
    moderation_email_time_of_day: settings.moderation_email_time_of_day,
    moderation_email_timezone: settings.moderation_email_timezone,
  }
}

function toUpdateUserOptions(preferences: Partial<EmailPreferences>): UpdateUserOptions {
  return {
    engagement_emails_enabled: preferences.engagement_emails_enabled,
    news_digest_frequency: preferences.news_digest_frequency,
    moderation_emails_enabled: preferences.moderation_emails_enabled,
    community_digest_frequency: preferences.community_digest_frequency,
    moderation_email_cadence: preferences.moderation_email_cadence,
    moderation_email_days_of_week: preferences.moderation_email_days_of_week,
    moderation_email_time_of_day: preferences.moderation_email_time_of_day,
    moderation_email_timezone: preferences.moderation_email_timezone ?? undefined,
  }
}
