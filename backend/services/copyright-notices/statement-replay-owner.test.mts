import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { createTestUser } from '@voucha/test-helpers'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  readTestCopyrightStatementIntents,
  replayTestCopyrightClaimantDecision,
} from '@voucha/test-helpers/copyright-statement-notices'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { createCopyrightPosterNoticesInTransaction } from './restriction-poster-notices.mts'
import { selectCopyrightStatementFacts } from './statement-of-reasons-facts.mts'

describe('copyright statement replay from durable authority', () => {
  useAutomaticProvisionalWithholding()

  it('keeps the first restriction statement after its assessment is superseded', async () => {
    const notice = await createClearScreenedForm()
    const submissionId = notice.notice.intake.copyright_notice_submission_id
    const noticeId = notice.notice.intake.copyright_notice_id
    await applyNonSpamSignedInCopyrightFormScreening(submissionId)
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    const restriction = before?.restrictions[0]
    if (!restriction) throw new Error('Automatic restriction was not recorded')
    const originalAssessmentId = restriction.authorizing_assessment_id
    const firstIntents = await readTestCopyrightStatementIntents(noticeId)
    const originalPosterBodies = firstIntents
      .filter(intent => intent.delivery_kind === 'poster_restriction_notice')
      .map(intent => intent.text)
    const originalClaimantBodies = firstIntents
      .filter(intent => intent.delivery_kind === 'claimant_decision_notice')
      .map(intent => intent.text)
    expect(originalPosterBodies.length).toBeGreaterThan(0)
    expect(originalClaimantBodies.length).toBeGreaterThan(0)

    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
      supersedesAssessmentId: originalAssessmentId,
    })

    await using transaction = await beginTransaction()
    const facts = await selectCopyrightStatementFacts(noticeId, transaction, {
      restrictionId: restriction.id,
      assessmentId: originalAssessmentId,
      targetId: restriction.copyright_notice_target_id,
    })
    expect(facts.automatedDecision).toBe(true)
    await expect(
      selectCopyrightStatementFacts(noticeId, transaction, { assessmentId: originalAssessmentId }),
    ).rejects.toMatchObject({ status: 409 })
    await createCopyrightPosterNoticesInTransaction(
      {
        noticeId,
        targetId: restriction.copyright_notice_target_id,
        restrictionId: restriction.id,
        event: 'restricted',
      },
      transaction,
    )
    await transaction.commit()
    await replayTestCopyrightClaimantDecision(noticeId, 'restricted')
    const replayed = await readTestCopyrightStatementIntents(noticeId)
    expect(
      replayed
        .filter(intent => intent.delivery_kind === 'poster_restriction_notice')
        .map(intent => intent.text),
    ).toEqual(originalPosterBodies)
    expect(
      replayed
        .filter(intent => intent.delivery_kind === 'claimant_decision_notice')
        .map(intent => intent.text),
    ).toEqual(originalClaimantBodies)
  })
})
