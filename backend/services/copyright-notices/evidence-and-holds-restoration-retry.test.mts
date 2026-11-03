import {
  acceptTestMediaDeliveryEdgeWrites,
  rejectTestMediaDeliveryEdgeState,
} from '@voucha/test-helpers/copyright-delivery-edge'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createAssessedUsDmcaCopyrightNoticeFixture } from '@voucha/test-helpers/copyright-us-dmca-notice-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('fails closed after restore delivery rejects, then republishes allow and completes on retry', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { aggregate, noticeAssessment, claimant, moderator, notice } = await createFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    await deliverInitialCopyrightWithhold(notice.id)
    const { now: restorationAt, restore } = await createCounterNoticeRestoreIntent({
      claimant,
      noticeId: notice.id,
      moderator,
      targetId: target.id,
      restrictionId: restriction.id,
      placementRevision: target.placement_revision,
    })
    edge.put.mockClear()
    rejectTestMediaDeliveryEdgeState(edge, 'allow', new Error('edge allow outage'))
    await expect(processCopyrightActionIntent(restore.id, restorationAt)).rejects.toThrow(
      'edge allow outage',
    )
    expect(edge.put.mock.calls.map(([record]) => record.state)).toEqual(['allow', 'withheld'])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'pending' }))
    acceptTestMediaDeliveryEdgeWrites(edge)
    await expect(
      processCopyrightActionIntent(restore.id, new Date(restorationAt.getTime() + 2 * 60_000)),
    ).resolves.toBe('applied')
    expect(edge.put.mock.calls.map(([record]) => record.state)).toEqual([
      'allow',
      'withheld',
      'allow',
    ])
    expect(
      (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
        intent => intent.id === restore.id,
      ),
    ).toEqual(expect.objectContaining({ state: 'completed', completed_at_reason: 'completed' }))
  })
})
