import { beginTransaction } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/services/copyright-notices/surface-target-fixtures'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'

describe('copyright restriction reversal sources', () => {
  it('does not authorize restoration for a restriction without a recorded reversal source', async () => {
    const fixture = await createTestCopyrightImageFixture('topic-logo-image')
    const restriction = await createTestCopyrightRestrictionForImage(fixture)

    await using transaction = await beginTransaction()
    await expect(
      createCopyrightRestoreIntentForReversalInTransaction(restriction.restrictionId, transaction),
    ).rejects.toMatchObject({ status: 409 })
  })
})
