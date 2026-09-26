import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import { openHeldCounterNoticeRestore } from './restoration-hold-scene.mts'

describe('copyright notice overlapping legal holds', () => {
  it('replays a blocked restore after the final overlapping hold resolves', async () => {
    const publish: typeof publishImagePlacementDeliveryRecord = async () => undefined
    const { initialWithhold, moderator, notice, restorationAt, restore, restriction, target } =
      await openHeldCounterNoticeRestore(publish)
    const initialRestore = restore
    await expect(
      processCopyrightActionIntent(initialRestore.id, restorationAt, {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')

    const firstHold = await createQualifyingHold({
      moderator,
      noticeId: notice.id,
      targetId: target.id,
      assessedAt: new Date(restorationAt.getTime() + 60_000),
      publish,
    })
    const holdWithhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'withhold' && intent.id !== initialWithhold.id,
    )
    if (!holdWithhold) throw new Error('hold withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(holdWithhold.id, new Date(restorationAt.getTime() + 120_000), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')

    const secondHold = await createQualifyingHold({
      moderator,
      noticeId: notice.id,
      targetId: target.id,
      assessedAt: new Date(restorationAt.getTime() + 150_000),
      publish,
    })
    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: firstHold.id,
      resolvedAt: new Date(restorationAt.getTime() + 180_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    const holdRestore = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'restore' && intent.copyright_restriction_id !== restriction.id,
    )
    if (!holdRestore) throw new Error('hold restore intent disappeared')
    await expect(
      processCopyrightActionIntent(holdRestore.id, new Date(restorationAt.getTime() + 240_000), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('blocked')
    await expect(getImagePlacementForCopyright(target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )

    await resolveCopyrightLegalHold({
      currentUser: moderator,
      assessmentId: secondHold.id,
      resolvedAt: new Date(restorationAt.getTime() + 300_000),
      resolutionKind: 'dismissed',
      rationale: `resolution-${crypto.randomUUID()}`,
    })
    await expect(
      processCopyrightActionIntent(holdRestore.id, new Date(restorationAt.getTime() + 360_000), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')
    await expect(getImagePlacementForCopyright(target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
  })
})

async function createQualifyingHold(input: {
  moderator: Parameters<typeof appendCopyrightLegalHoldAssessment>[0]['currentUser']
  noticeId: string
  targetId: string
  assessedAt: Date
  publish: typeof publishImagePlacementDeliveryRecord
}) {
  const receivedAt = new Date('2026-07-03T12:00:00.000Z')
  const submission = await appendCopyrightNoticeSubmission({
    noticeId: input.noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
  return await appendCopyrightLegalHoldAssessment({
    currentUser: input.moderator,
    submissionId: submission.id,
    assessedAt: input.assessedAt,
    fromOriginalClaimant: true,
    proceedingKind: 'federal_court',
    ccbClaimKind: null,
    commencedAt: new Date('2026-07-03T11:00:00.000Z'),
    receivedByDesignatedAgentAt: receivedAt,
    sameMaterial: true,
    targetIds: [input.targetId],
    rationale: 'Verified qualifying federal court filing.',
    dependencies: {
      assertLegalEnforcementEnabled: () => {},
      publishPlacement: input.publish,
    },
  })
}
