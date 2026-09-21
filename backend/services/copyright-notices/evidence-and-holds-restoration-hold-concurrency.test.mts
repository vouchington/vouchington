import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  createCopyrightCounterNotice,
  createCounterNoticeDeadline,
  createEligibleCopyrightRestoreIntent,
  getCopyrightNoticePrivateAggregate,
  processCopyrightActionIntent,
} from './index.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'

describe('late legal-hold and restoration concurrency', () => {
  it('serializes the placement fence before case records, leaving a concurrent restored tuple denied', async () => {
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
    const initialWithhold = (
      await getCopyrightNoticePrivateAggregate(notice.id)
    )?.actionIntents.find(intent => intent.action === 'withhold')
    if (!initialWithhold) throw new Error('initial withhold intent disappeared')
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    await expect(
      processCopyrightActionIntent(initialWithhold.id, new Date('2026-07-01T12:01:00.000Z'), {
        publishImagePlacementDeliveryRecord: publish,
      }),
    ).resolves.toBe('applied')
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [target.id],
      },
    )
    const counterAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
    const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    const restore = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now: restorationAt,
    })
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(restorationAt.getTime() - 1),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `concurrent-hold-${crypto.randomUUID()}`,
    })

    const [restoreOutcome, holdOutcome] = await Promise.all([
      processCopyrightActionIntent(restore.id, restorationAt, {
        publishImagePlacementDeliveryRecord: publish,
      }),
      appendCopyrightLegalHoldAssessment({
        currentUser: moderator,
        submissionId: holdSubmission.id,
        assessedAt: new Date(restorationAt.getTime() + 60_000),
        fromOriginalClaimant: true,
        proceedingKind: 'federal_court',
        ccbClaimKind: null,
        commencedAt: new Date(restorationAt.getTime() - 60_000),
        receivedByDesignatedAgentAt: new Date(restorationAt.getTime() - 1),
        sameMaterial: true,
        targetIds: [target.id],
        rationale: 'Verified qualifying filing during restoration.',
        dependencies: {
          assertLegalEnforcementEnabled: () => {},
          publishPlacement: publish,
        },
      }),
    ])

    expect(['applied', 'blocked']).toContain(restoreOutcome)
    expect(holdOutcome.target_ids).toEqual([target.id])
    await expect(getImagePlacementForCopyright(target.placement_key)).resolves.toEqual(
      expect.objectContaining({ withheld: true }),
    )
  })
})
