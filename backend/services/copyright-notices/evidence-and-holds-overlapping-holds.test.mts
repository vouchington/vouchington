import { describe, expect, it } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
  resolveCopyrightLegalHold,
} from './index.mts'
import {
  createCompliantCounterNoticeDeadline,
  createCopyrightRestorationHoldFixture,
} from './evidence-and-holds-restoration-hold-fixtures.mts'

describe('copyright notice overlapping legal holds', () => {
  it('replays a blocked restore after the final overlapping hold resolves', async () => {
    const {
      aggregate,
      assessment: noticeAssessment,
      claimant,
      moderator,
      notice,
    } = await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const publish: typeof publishImagePlacementDeliveryRecord = async () => undefined
    const initialWithhold = (
      await getCopyrightNoticePrivateAggregate(notice.id)
    )?.actionIntents.find(intent => intent.action === 'withhold')
    if (!initialWithhold) throw new Error('initial withhold intent disappeared')
    await expect(
      processCopyrightActionIntent(initialWithhold.id, new Date('2026-07-01T12:01:00.000Z'), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')

    const deadline = await createCompliantCounterNoticeDeadline({
      claimant,
      noticeId: notice.id,
      moderator,
      targetIds: [target.id],
    })
    const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    const initialRestore = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: restorationAt,
    })
    await expect(
      processCopyrightActionIntent(initialRestore.id, restorationAt, {
        publishImagePlacementDeliveryRecord: publish,
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
        publishImagePlacementDeliveryRecord: publish,
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
        publishImagePlacementDeliveryRecord: publish,
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
        publishImagePlacementDeliveryRecord: publish,
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
