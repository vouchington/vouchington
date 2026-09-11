// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientRequest } from '@/lib/api/client/request'
import {
  clearNotificationSettingsFixture,
  setNotificationSettingsFixture,
} from '../mocks/client-api-instance'

describe('notification settings Storybook fixtures', () => {
  afterEach(() => {
    clearNotificationSettingsFixture()
    vi.unstubAllGlobals()
  })

  it('serves the configured preference snapshot through the Storybook client request seam', async () => {
    setNotificationSettingsFixture({
      engagement_emails_enabled: true,
      news_digest_frequency: 'weekly',
      moderation_emails_enabled: false,
      community_digest_frequency: 'weekly',
      moderation_email_cadence: 'selected_days',
      moderation_email_days_of_week: [1, 3, 5],
      moderation_email_time_of_day: '08:30',
      moderation_email_timezone: 'America/Los_Angeles',
    })

    await expect(new ClientRequest().get('/api/v1/my/email-preferences')).resolves.toEqual({
      email_preferences: expect.objectContaining({ moderation_emails_enabled: false }),
    })
  })

  it('clears the fixture and delegates the preference request to fetch', async () => {
    clearNotificationSettingsFixture()
    const response = { anything: true }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(new ClientRequest().get('/api/v1/my/email-preferences')).resolves.toEqual(response)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/my/email-preferences',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
