import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createGuestCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  reviewFormAndAssessCopyrightSubmission,
  readCopyrightAssessmentPointers,
} from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { readTestCopyrightFormReviewActor } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

async function createScene() {
  const [form, currentUser] = await Promise.all([
    createGuestCopyrightForm(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  return {
    form,
    currentUser,
    input: {
      intakeId: form.intake.id,
      currentUser,
      is_accepted: false,
      rationale: 'The complaint does not substantiate a restriction.',
    },
  }
}

describe('form review and another submission assessment in one copyright case', () => {
  it.each(['review', 'assessment'] as const)(
    'commits %s and rolls back the overlapping sibling with a coded conflict',
    async first => {
      const { form, currentUser, input } = await createScene()
      const noticeId = form.intake.copyright_notice_id
      const submission = await appendTestCopyrightNoticeSubmission({
        noticeId,
        kind: 'notice',
        sourceKind: 'staff',
        submittedByUserId: null,
        receivedAt: new Date(),
        bodyCiphertext: 'Independent staff evidence.',
      })
      const { reviewed, assessed } = await reviewFormAndAssessCopyrightSubmission(
        input,
        {
          currentUser,
          submissionId: submission.id,
          substantiallyCompliant: true,
          assessedAt: new Date(),
        },
        noticeId,
        first,
      )
      const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
      const winnerId =
        first === 'review' ? form.intake.copyright_notice_submission_id : submission.id
      const loserId =
        first === 'review' ? submission.id : form.intake.copyright_notice_submission_id
      expect(aggregate?.assessments).toEqual([
        expect.objectContaining({
          copyright_notice_submission_id: winnerId,
          assessed_by_id: currentUser.id,
          is_substantially_compliant: first === 'assessment',
        }),
      ])
      const winnerAssessment = aggregate!.assessments[0]!
      expect(await readCopyrightAssessmentPointers(noticeId)).toEqual(
        expect.arrayContaining([
          { id: winnerId, current_assessment_identity_id: winnerAssessment.id },
          { id: loserId, current_assessment_identity_id: null },
        ]),
      )
      expect(
        aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
      ).toEqual([
        expect.objectContaining({
          copyright_notice_submission_assessment_identity_id: winnerAssessment.id,
        }),
      ])
      const conflict = {
        status: 'rejected',
        reason: { status: 409, code: 'CONFLICT', cause: { code: '40001' } },
      }
      expect(reviewed).toMatchObject(
        first === 'review'
          ? {
              status: 'fulfilled',
              value: {
                noticeId,
                submissionId: form.intake.copyright_notice_submission_id,
                is_accepted: false,
              },
            }
          : conflict,
      )
      expect(assessed).toMatchObject(
        first === 'assessment'
          ? {
              status: 'fulfilled',
              value: {
                id: winnerAssessment.id,
                copyright_notice_submission_id: submission.id,
                assessed_by_id: currentUser.id,
                is_substantially_compliant: true,
              },
            }
          : conflict,
      )
      const actor = await readTestCopyrightFormReviewActor(input.intakeId).catch((err: unknown) => {
        if (err instanceof Error && err.message.startsWith('Copyright form review was not found:'))
          return null
        throw err
      })
      expect(actor).toBe(first === 'review' ? currentUser.id : null)
    },
  )

  it('records the review without duplicating an existing matching human assessment', async () => {
    const { form, currentUser, input } = await createScene()
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: form.intake.copyright_notice_submission_id,
      currentUser,
      assessedAt: new Date(),
      substantiallyCompliant: false,
    })
    await reviewCopyrightFormIntake(input)
    const aggregate = await getCopyrightNoticePrivateAggregate(form.intake.copyright_notice_id)
    expect(await readTestCopyrightFormReviewActor(input.intakeId)).toBe(currentUser.id)
    expect(aggregate?.assessments).toEqual([expect.objectContaining({ id: assessment.id })])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toHaveLength(1)
    await expect(reviewCopyrightFormIntake({ ...input, is_accepted: true })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('rolls back the earlier assessment, lifecycle event and clock if recording the review fails', async () => {
    const { form, input } = await createScene()
    const noticeId = form.intake.copyright_notice_id
    const before = await readCopyrightCaseLifecycleClock(noticeId)
    const failure = new Error('Owned form review failed')
    await expect(
      observeTestPostgresClientQueries(
        () => reviewCopyrightFormIntake(input),
        async query => {
          if (query.text.includes('/* reviewCopyrightFormIntake:review */')) throw failure
        },
      ),
    ).rejects.toBe(failure)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    await expect(readTestCopyrightFormReviewActor(input.intakeId)).rejects.toThrow(
      'Copyright form review was not found:',
    )
    expect(aggregate?.assessments).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([])
    expect(await readCopyrightCaseLifecycleClock(noticeId)).toEqual(before)
    await expect(reviewCopyrightFormIntake(input)).resolves.toMatchObject({ is_accepted: false })
  })
})
