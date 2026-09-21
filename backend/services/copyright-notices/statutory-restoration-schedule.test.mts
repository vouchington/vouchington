import { describe, expect, it } from 'vitest'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightLegalHoldAssessment,
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  createCopyrightCounterNotice,
  createCounterNoticeDeadline,
} from './index.mts'
import { createCopyrightRestorationHoldFixture } from './evidence-and-holds-restoration-hold-fixtures.mts'
import { createDueStatutoryCopyrightRestoreIntents } from './statutory-restoration-schedule.mts'

describe('createDueStatutoryCopyrightRestoreIntents', () => {
  it('materializes no restore intents when no due deadlines exist', async () => {
    await expect(createDueStatutoryCopyrightRestoreIntents(new Date())).resolves.toBe(0)
  })

  it('fails closed when a due restoration is blocked by a qualifying legal hold', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const counterNotice = await createCopyrightCounterNotice(
      claimant as never,
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
    const holdSubmission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date('2026-07-02T13:00:00.000Z'),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: holdSubmission.id,
      assessedAt: new Date('2026-07-02T13:01:00.000Z'),
      fromOriginalClaimant: true,
      proceedingKind: 'ccb',
      ccbClaimKind: 'claim',
      commencedAt: new Date('2026-07-02T13:00:00.000Z'),
      receivedByDesignatedAgentAt: new Date('2026-07-02T13:00:00.000Z'),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Verified qualifying CCB filing.',
    })
    await expect(
      createDueStatutoryCopyrightRestoreIntents(
        new Date(deadline.earliest_restoration_at.getTime() + 60_000),
      ),
    ).rejects.toThrow(/Failed to materialize one or more due copyright restoration intents/)
  })
})
