import { describe, expect, it } from 'vitest'
import { testCreateCopyrightRestoreIntentForReversal } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'

describe('copyright restriction reversal sources', () => {
  it('does not authorize restoration for a restriction without a recorded reversal source', async () => {
    const fixture = await createTestCopyrightImageFixture('topic-logo-image')
    const restriction = await createTestCopyrightRestrictionForImage(fixture)

    await expect(
      testCreateCopyrightRestoreIntentForReversal(restriction.restrictionId),
    ).rejects.toMatchObject({ status: 409 })
  })
})
