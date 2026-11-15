import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  claimTestModerationEmailSend,
  createClockSkewModerationSummaryFixture,
} from '@voucha/test-helpers/moderation-summary-retention'
import { hasModerationEmailSent } from '@services/communities/moderation-summary-emails'
import {
  moderationSummaryVariableDefaults,
  processTestModerationSummaryEmail as processSendCommunityModerationSummaryEmail,
} from '@voucha/test-helpers/moderation-summary-collection'

describe('moderation summary dispatcher clock skew', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    { cadence: 'daily' as const, vacationBoundary: false, excludeActivity: false },
    { cadence: 'weekly' as const, vacationBoundary: false, excludeActivity: false },
    { cadence: 'daily' as const, vacationBoundary: true, excludeActivity: false },
    { cadence: 'daily' as const, vacationBoundary: false, excludeActivity: true },
  ])(
    'delivers a $cadence claim once when the queued window is ahead of the worker (vacation=$vacationBoundary, excludeActivity=$excludeActivity)',
    async ({ cadence, vacationBoundary, excludeActivity }) => {
      const queuedWindowEnd = new Date(Date.now() + 2 * 60 * 1000)
      const { userId, trackingKey, queuedDate } = await createClockSkewModerationSummaryFixture(
        queuedWindowEnd,
        { cadence, excludeActivity, vacationBoundary },
      )
      expect(await claimTestModerationEmailSend(userId, trackingKey)).toBe(true)
      const input = {
        userId,
        trackingKey,
        windowStart: '2019-01-01T00:00:00.000Z',
        windowEnd: queuedWindowEnd.toISOString(),
      }
      const variables = {
        generatedForDate: queuedDate,
        dispatchTimeZone: 'UTC',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        ...moderationSummaryVariableDefaults(),
        communities: [],
      }

      await processSendCommunityModerationSummaryEmail(input, variables)

      expect(ses.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: `Community moderation summary for ${queuedDate}` }),
      )
      const message = vi.mocked(ses.sendEmail).mock.calls[0]?.[0]
      expect(message?.text?.includes('Clock skew moderation activity')).toBe(!excludeActivity)
      await expect(hasModerationEmailSent(userId, trackingKey)).resolves.toBe(true)
      await expect(processSendCommunityModerationSummaryEmail(input, variables)).resolves.toBeNull()
      expect(ses.sendEmail).toHaveBeenCalledTimes(1)
    },
  )
})
