import { describe, expect, it } from 'vitest'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import { searchRecoverableCopyrightActionIntentIds } from './action-delivery-state.mts'
import { createCopyrightActionSweepRestricted } from '@voucha/test-helpers/copyright-action-sweep-fixtures'
import { claimActionDeliveryFixture } from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { beginTransaction } from '@voucha/test-helpers'

function readRecoverableIntentIds(intentId: string, now: Date): Promise<string[]> {
  return readTestOwnedCopyrightSweepIds(
    options => searchRecoverableCopyrightActionIntentIds({ ...options, now }),
    intentId,
  )
}

describe('copyright action delivery recovery', () => {
  it('lists a pending intent, skips its live claim, and relists it once the lease expires', async () => {
    const { intent } = await createCopyrightActionSweepRestricted()
    const now = new Date()
    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([intent.id])

    {
      await using transaction = await beginTransaction()
      await expect(claimActionDeliveryFixture(intent.id, transaction)).resolves.not.toBeNull()
      await transaction.commit()
    }

    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([])
    const leaseExpired = new Date(now.getTime() + 5 * 60 * 1000 + 1000)
    await expect(readRecoverableIntentIds(intent.id, leaseExpired)).resolves.toEqual([intent.id])
  })
})
