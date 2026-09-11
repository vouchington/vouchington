import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { getMyEmailPreferences, updateMyEmailPreferences } from '../email-preferences'

const mockGet = vi.mocked(clientApi.get)
const mockPatch = vi.mocked(clientApi.patch)

describe('email preferences client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects updates with multiple preference fields', () => {
    // @ts-expect-error -- updates must contain exactly one preference field
    const invalidUpdate: Parameters<typeof updateMyEmailPreferences>[0] = {
      engagement_emails_enabled: false,
      moderation_emails_enabled: false,
    }

    expect(invalidUpdate).toBeDefined()
  })

  it('gets the current user email preferences', async () => {
    const response = {
      email_preferences: {
        engagement_emails_enabled: true,
        news_digest_frequency: 'weekly' as const,
        moderation_emails_enabled: true,
        community_digest_frequency: 'daily' as const,
        moderation_email_cadence: 'selected_days' as const,
        moderation_email_days_of_week: [1, 3, 5],
        moderation_email_time_of_day: '09:00',
        moderation_email_timezone: 'America/Los_Angeles',
      },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await getMyEmailPreferences()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/my/email-preferences')
    expect(result).toBe(response)
  })

  it('updates the supplied email preferences', async () => {
    const preferences = { engagement_emails_enabled: false }
    const response = {
      email_preferences: {
        engagement_emails_enabled: false,
        news_digest_frequency: 'weekly' as const,
        moderation_emails_enabled: true,
        community_digest_frequency: 'daily' as const,
        moderation_email_cadence: 'selected_days' as const,
        moderation_email_days_of_week: [1, 3, 5],
        moderation_email_time_of_day: '09:00',
        moderation_email_timezone: 'America/Los_Angeles',
      },
    }
    mockPatch.mockResolvedValueOnce(response)

    const result = await updateMyEmailPreferences(preferences)

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/my/email-preferences', preferences)
    expect(result).toBe(response)
  })
})
