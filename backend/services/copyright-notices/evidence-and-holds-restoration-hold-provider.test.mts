import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { rejectTestMediaDeliveryEdgeState } from '@voucha/test-helpers/copyright-delivery-edge'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { appendCopyrightLegalHoldAssessment, processCopyrightActionIntent } from './index.mts'
import type { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('late legal-hold edge publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rolls back every late-hold record when the edge provider rejects the denial', async () => {
    const edge = installTestMediaDeliveryEdge()
    const restored = await restorePlacementForLateHold()
    const before = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    const restoredPlacement = await getImagePlacementForCopyright(restored.placementId)
    if (!restoredPlacement) throw new Error('restored placement disappeared')
    edge.put.mockClear()
    rejectTestMediaDeliveryEdgeState(
      edge,
      'withheld',
      new Error('DynamoDB denied the legal withholding write'),
    )

    await expect(appendLateHold(restored)).rejects.toThrow(
      'DynamoDB denied the legal withholding write',
    )

    const after = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    expect(after?.holdAssessments).toEqual(before?.holdAssessments)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.actionIntents).toEqual(before?.actionIntents)
    await expect(getImagePlacementForCopyright(restored.placementId)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
    expect(edge.put.mock.calls.map(([record]) => record)).toEqual([
      expect.objectContaining({
        deliveryKey: getImagePlacementDeliveryKey({
          placementId: restoredPlacement.placementId,
          revision: restoredPlacement.revision,
          imageId: restoredPlacement.imageId,
        }),
        state: 'withheld',
      }),
    ])
  })

  it('publishes the denial before it makes the restored placement withheld in PostgreSQL', async () => {
    const edge = installTestMediaDeliveryEdge()
    const restored = await restorePlacementForLateHold()
    const withheldStatesAtPublication: boolean[] = []
    edge.put.mockImplementation(async input => {
      const placement = await getImagePlacementForCopyright(restored.placementId)
      if (!placement) throw new Error('restored placement disappeared')
      expect(input).toEqual(
        expect.objectContaining({
          deliveryKey: getImagePlacementDeliveryKey({
            placementId: placement.placementId,
            revision: placement.revision,
            imageId: placement.imageId,
          }),
          state: 'withheld',
        }),
      )
      withheldStatesAtPublication.push(placement.withheld)
      edge.accept(input)
      return { $metadata: {} }
    })

    await appendLateHold(restored)

    expect(withheldStatesAtPublication).toEqual([false])
    await expect(getImagePlacementForCopyright(restored.placementId)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})

async function restorePlacementForLateHold(): Promise<{
  moderator: Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>['moderator']
  noticeId: string
  placementId: string
  restorationAt: Date
  targetId: string
}> {
  const { moderator, notice, restorationAt, restore, target } = await openHeldCounterNoticeRestore()
  await processCopyrightActionIntent(restore.id, restorationAt)
  return {
    moderator,
    noticeId: notice.id,
    placementId: target.placement_id,
    restorationAt,
    targetId: target.id,
  }
}

async function appendLateHold(restored: Awaited<ReturnType<typeof restorePlacementForLateHold>>) {
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId: restored.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date(restored.restorationAt.getTime() - 1),
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `late-hold-${crypto.randomUUID()}`,
  })
  return appendCopyrightLegalHoldAssessment({
    currentUser: restored.moderator,
    submissionId: submission.id,
    assessedAt: new Date(restored.restorationAt.getTime() + 60_000),
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date(restored.restorationAt.getTime() - 60_000),
    receivedByDesignatedAgentAt: new Date(restored.restorationAt.getTime() - 1),
    sameMaterial: true,
    targetIds: [restored.targetId],
    rationale: 'Verified qualifying federal court filing before restoration.',
  })
}
