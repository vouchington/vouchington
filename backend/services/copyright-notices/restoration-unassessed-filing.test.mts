import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
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

const counterNoticeBody = {
  name: 'Poster',
  address: '1 Main Street',
  telephone: '555-0100',
  consentToFederalJurisdiction: true,
  consentToServiceOfProcess: true,
  goodFaithMisidentificationUnderPenaltyOfPerjury: true,
  electronicSignature: 'Poster',
}

async function openRestorationWindow() {
  const fixture = await createCopyrightRestorationHoldFixture()
  const target = fixture.aggregate.targets[0]!
  const restriction = await acceptCopyrightNoticeAndImposeRestriction({
    noticeId: fixture.notice.id,
    targetId: target.id,
    assessmentId: fixture.assessment.id,
    imposedAt: new Date('2026-07-01T12:00:00.000Z'),
    imposedById: fixture.moderator.id,
  })
  const counterNotice = await createCopyrightCounterNotice(
    fixture.claimant,
    fixture.notice.id,
    crypto.randomUUID(),
    { ...counterNoticeBody, targetIds: [target.id] },
  )
  const counterAssessment = await appendCopyrightSubmissionAssessment({
    submissionId: counterNotice.submission.id,
    assessedAt: new Date('2026-07-02T12:00:00.000Z'),
    currentUser: fixture.moderator,
    substantiallyCompliant: true,
    targetIds: [target.id],
  })
  const deadline = await createCounterNoticeDeadline({ assessmentId: counterAssessment.id })
  return {
    ...fixture,
    target,
    restriction,
    deadline,
    now: new Date(deadline.earliest_restoration_at.getTime() + 60_000),
  }
}

async function recordCourtFiling(noticeId: string) {
  return appendCopyrightNoticeSubmission({
    noticeId,
    kind: 'court_or_ccb_hold',
    receivedAt: new Date('2026-07-02T13:00:00.000Z'),
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `hold-${crypto.randomUUID()}`,
  })
}

describe('unassessed court or CCB filings', () => {
  it('blocks the case until an assessment records that the filing does not qualify', async () => {
    const { deadline, moderator, notice, now, restriction, target } = await openRestorationWindow()
    const filing = await recordCourtFiling(notice.id)
    const restore = {
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now,
    }
    await expect(createEligibleCopyrightRestoreIntent(restore)).rejects.toThrow(
      'Copyright restoration awaits assessment of a court or CCB filing',
    )
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: new Date('2026-07-02T13:01:00.000Z'),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [target.id],
      rationale: 'The filing does not identify a commenced proceeding.',
    })
    const intent = await createEligibleCopyrightRestoreIntent(restore)
    expect(intent.action).toBe('restore')
  })

  it('blocks an already created restore until the filing is assessed, then reopens it', async () => {
    const { deadline, moderator, notice, now, restriction, target } = await openRestorationWindow()
    const withhold = (await getCopyrightNoticePrivateAggregate(notice.id))?.actionIntents.find(
      intent => intent.action === 'withhold',
    )
    if (!withhold) throw new Error('initial withhold intent disappeared')
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    await expect(
      processCopyrightActionIntent(withhold.id, new Date('2026-07-01T12:01:00.000Z'), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')
    const restore = await createEligibleCopyrightRestoreIntent({
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now,
    })
    const filing = await recordCourtFiling(notice.id)
    await expect(
      processCopyrightActionIntent(restore.id, now, {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('blocked')
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: new Date(now.getTime() + 60_000),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [target.id],
      rationale: 'The filing does not identify a commenced proceeding.',
    })
    await expect(
      processCopyrightActionIntent(restore.id, new Date(now.getTime() + 120_000), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')
  })
})
