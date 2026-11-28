import { describe, expect, it } from 'vitest'
import { createTestUser, claimCurrentModerationSummaryForTest } from '@voucha/test-helpers'
import { createModerationSummaryCollection } from '@voucha/test-helpers/moderation-summary-collection'
import { updateUserFields } from '@services/users/update-fields'
import { processModerationSummaryStage } from './moderation-summary-stage.mts'

const variables = (dispatchTimeZone: string) => ({
  generatedForDate: '2026-01-20',
  dispatchTimeZone,
  settingsUrl: 'https://example.test/settings',
  unsubscribeUrl: 'https://example.test/unsubscribe',
  physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
  remainingCommunityCount: 0,
  communities: [],
  collection: createModerationSummaryCollection(),
})

describe('moderation summary stage job guards', () => {
  it('ends a stage for a recipient that no longer exists', async () => {
    const result = await processModerationSummaryStage(
      'memberships',
      { userId: crypto.randomUUID(), trackingKey: 'daily:2026-01-20' },
      variables('UTC'),
    )
    expect(result).toMatchObject({ status: 'skipped' })
  })

  it('ends a stage without continuing when moderation emails were turned off', async () => {
    const user = await createTestUser()
    await updateUserFields(user.id, { is_moderation_emails_enabled: false })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user.id,
    )
    expect(
      await processModerationSummaryStage(
        'reviews',
        { userId: user.id, trackingKey, windowEnd },
        variables(dispatchTimeZone),
      ),
    ).toBeNull()
  })
})
