import {
  createTestCopyrightDeliveryDependencies,
  type CopyrightTestDeliveryPublisher,
} from '@voucha/test-helpers/copyright-delivery-dependencies'
import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { describe, expect, it } from 'vitest'
import { processCopyrightActionIntent } from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import {
  createCounterNoticeRestoreIntent,
  deliverInitialCopyrightWithhold,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

async function createFixture() {
  return createAssessedUsDmcaCopyrightNoticeFixture({
    postTitlePrefix: 'copyright evidence',
    postSlugPrefix: 'copyright-evidence',
    postMarkdown: 'images',
    claimantDisplayName: null,
    noticeBodyCiphertext: 'notice',
    receiptIdempotencyKeyPrefix: 'copyright-evidence-receipt',
    assessBeforeReceipt: true,
  })
}

describe('copyright notice restoration retries', () => {
  it('fails closed after restore delivery rejects, then republishes allow and completes on retry', async () => {
    const { aggregate, noticeAssessment, claimant, moderator, notice } = await createFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    await deliverInitialCopyrightWithhold(
      notice.id,
      createTestCopyrightDeliveryDependencies(async () => undefined),
    )
    const { now: restorationAt, restore } = await createCounterNoticeRestoreIntent({
      claimant,
      noticeId: notice.id,
      moderator,
      targetId: target.id,
      restrictionId: restriction.id,
      placementRevision: target.placement_revision,
    })
    let rejectFirstAllow = true
    const publishedStates: string[] = []
    const publish: CopyrightTestDeliveryPublisher = async input => {
      publishedStates.push(input.state)
      if (input.state === 'allow' && rejectFirstAllow) {
        rejectFirstAllow = false
        throw new Error('edge allow outage')
      }
    }
    await expect(
      processCopyrightActionIntent(restore.id, restorationAt, {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).rejects.toThrow('edge allow outage')
    expect(publishedStates).toEqual(['allow', 'withheld'])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'pending' }))
    await expect(
      processCopyrightActionIntent(restore.id, new Date(restorationAt.getTime() + 2 * 60_000), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')
    expect(publishedStates).toEqual(['allow', 'withheld', 'allow'])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'completed', completed_at_reason: 'completed' }))
  })
})
