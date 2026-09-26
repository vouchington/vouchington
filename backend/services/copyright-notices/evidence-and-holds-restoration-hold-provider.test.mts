import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'
import { type createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'
import { openHeldCounterNoticeRestore } from './restoration-hold-scene.mts'

describe('late legal-hold edge publication', () => {
  it('rolls back every late-hold record when the edge provider rejects the denial', async () => {
    const restored = await restorePlacementForLateHold()
    const before = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    const publish = vi
      .fn<typeof publishImagePlacementDeliveryRecord>()
      .mockRejectedValue(new Error('DynamoDB denied the legal withholding write'))

    await expect(appendLateHold(restored, publish)).rejects.toThrow(
      'DynamoDB denied the legal withholding write',
    )

    const after = await getCopyrightNoticePrivateAggregate(restored.noticeId)
    expect(after?.holdAssessments).toEqual(before?.holdAssessments)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.actionIntents).toEqual(before?.actionIntents)
    await expect(getImagePlacementForCopyright(restored.placementKey)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'withheld' }),
      expect.any(Object),
    )
  })

  it('publishes the denial before it makes the restored placement withheld in PostgreSQL', async () => {
    const restored = await restorePlacementForLateHold()
    const withheldStatesAtPublication: boolean[] = []
    const publish = vi
      .fn<typeof publishImagePlacementDeliveryRecord>()
      .mockImplementation(async input => {
        expect(input.state).toBe('withheld')
        const placement = await getImagePlacementForCopyright(restored.placementKey)
        if (!placement) throw new Error('restored placement disappeared')
        withheldStatesAtPublication.push(placement.withheld)
      })

    await appendLateHold(restored, publish)

    expect(withheldStatesAtPublication).toEqual([false])
    await expect(getImagePlacementForCopyright(restored.placementKey)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})

async function restorePlacementForLateHold(): Promise<{
  moderator: Awaited<ReturnType<typeof createCopyrightRestorationHoldFixture>>['moderator']
  noticeId: string
  placementKey: string
  restorationAt: Date
  targetId: string
}> {
  const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
  const { moderator, notice, restorationAt, restore, target } =
    await openHeldCounterNoticeRestore(publish)
  await processCopyrightActionIntent(restore.id, restorationAt, {
    ...createTestCopyrightDeliveryDependencies(publish),
  })
  return {
    moderator,
    noticeId: notice.id,
    placementKey: target.placement_key,
    restorationAt,
    targetId: target.id,
  }
}

async function appendLateHold(
  restored: Awaited<ReturnType<typeof restorePlacementForLateHold>>,
  publishPlacement: typeof publishImagePlacementDeliveryRecord,
) {
  const submission = await appendCopyrightNoticeSubmission({
    noticeId: restored.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date(restored.restorationAt.getTime() - 1),
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `late-hold-${crypto.randomUUID()}`,
  })
  return await appendCopyrightLegalHoldAssessment({
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
    dependencies: { assertLegalEnforcementEnabled: () => {}, publishPlacement },
  })
}
