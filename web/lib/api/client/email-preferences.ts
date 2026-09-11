'use client'

import { clientApi } from './instance'

export type EmailPreferences = {
  engagement_emails_enabled: boolean
  news_digest_frequency: 'none' | 'daily' | 'weekly'
  moderation_emails_enabled: boolean
  community_digest_frequency: 'none' | 'daily' | 'weekly'
  moderation_email_cadence: 'daily' | 'selected_days' | 'weekly'
  moderation_email_days_of_week: number[]
  moderation_email_time_of_day: string
  moderation_email_timezone: string | null
}

export type EmailPreferencesResponse = { email_preferences: EmailPreferences }

export type EmailPreferenceUpdate = {
  [K in keyof EmailPreferences]: Record<K, EmailPreferences[K]> &
    Partial<Record<Exclude<keyof EmailPreferences, K>, never>>
}[keyof EmailPreferences]

export function getMyEmailPreferences(): Promise<EmailPreferencesResponse> {
  return clientApi.get<EmailPreferencesResponse>('/api/v1/my/email-preferences')
}

export function updateMyEmailPreferences(
  body: EmailPreferenceUpdate,
): Promise<EmailPreferencesResponse> {
  return clientApi.patch<EmailPreferencesResponse>('/api/v1/my/email-preferences', body)
}
