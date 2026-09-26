import { describe, expect, it } from 'vitest'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import {
  claimCopyrightActionIntent,
  searchRecoverableCopyrightActionIntentIds,
} from './action-delivery-state.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'

function readRecoverableIntentIds(intentId: string, now: Date): Promise<string[]> {
  return readTestOwnedCopyrightSweepIds(
    options => searchRecoverableCopyrightActionIntentIds({ ...options, now }),
    intentId,
  )
}

describe('copyright action delivery recovery', () => {
  it('lists a pending intent, skips its live claim, and relists it once the lease expires', async () => {
    const { aggregate, assessment, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: aggregate.targets[0]!.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: moderator.id,
    })
    const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
    const intent = restricted!.actionIntents.find(record => record.action === 'withhold')!
    const now = new Date()
    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([intent.id])

    await expect(claimCopyrightActionIntent(intent.id, now)).resolves.not.toBeNull()

    await expect(readRecoverableIntentIds(intent.id, now)).resolves.toEqual([])
    const leaseExpired = new Date(now.getTime() + 5 * 60 * 1000 + 1000)
    await expect(readRecoverableIntentIds(intent.id, leaseExpired)).resolves.toEqual([intent.id])
  })
})
