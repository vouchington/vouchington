import { describe, expect, it } from 'vitest'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  createCopyrightCounterNotice,
  createCounterNoticeDeadline,
  createDueStatutoryCopyrightRestoreIntents,
  getCopyrightNoticePrivateAggregate,
  listRecoverableCopyrightActionIntentIds,
  processCopyrightActionIntent,
} from './index.mts'
import { getCopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { finalizeCopyrightActionAfterDelivery } from './action-delivery-finalization.mts'
import {
  replayCopyrightRestoreActionsForRestrictions,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'

describe('copyright action delivery recovery', () => {
  it('lists recoverable action intents and ignores an unknown claimed lease', async () => {
    await expect(listRecoverableCopyrightActionIntentIds(10, new Date())).resolves.toEqual(
      expect.any(Array),
    )
    await expect(
      finalizeCopyrightActionAfterDelivery(
        crypto.randomUUID(),
        'withhold',
        new Date(),
        getCopyrightActionDeliveryDependencies({}),
      ),
    ).resolves.toBe(false)
    await expect(
      compensateCopyrightActionFailure(
        {
          id: crypto.randomUUID(),
          action: 'restore',
          image_id: crypto.randomUUID(),
          placement_key: `image-placement:${crypto.randomUUID()}`,
        } as CopyrightClaimedActionIntent,
        new Date(),
        null,
        getCopyrightActionDeliveryDependencies({}),
        new Error('provider outage'),
      ),
    ).rejects.toThrow('provider outage')
  })

  it('materializes a due statutory restore and can replay a blocked restore lease', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const counterNotice = await createCopyrightCounterNotice(
      claimant,
      notice.id,
      crypto.randomUUID(),
      counterNoticeInput(target.id),
    )
    const counterAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: counterNotice.submission.id,
      assessedAt: new Date('2026-07-02T12:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
      targetIds: [target.id],
    })
    const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
    await completeCopyrightMandatoryHumanReview({
      currentUser: moderator,
      noticeId: notice.id,
      restrictionId: restriction.id,
      action: 'confirm',
      rationale: 'The restriction remains appropriate after review.',
      reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
    })
    const restorationAt = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    await expect(createDueStatutoryCopyrightRestoreIntents(restorationAt)).resolves.toBe(1)
    const restore = (await getActionIntent(notice.id, 'restore'))!
    await expect(
      processCopyrightActionIntent(
        restore.id,
        new Date(deadline.earliest_restoration_at.getTime() - 60_000),
        {
          publishImagePlacementDeliveryRecord: async () => undefined,
        },
      ),
    ).resolves.toBe('blocked')
    await expect(replayCopyrightRestoreActionsForRestrictions([restriction.id])).resolves.toBe(1)
  })
})

async function getActionIntent(noticeId: string, action: 'withhold' | 'restore') {
  return (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === action,
  )
}

function counterNoticeInput(targetId: string) {
  return {
    name: 'Poster',
    address: '1 Main Street',
    telephone: '555-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Poster',
    targetIds: [targetId],
  }
}
