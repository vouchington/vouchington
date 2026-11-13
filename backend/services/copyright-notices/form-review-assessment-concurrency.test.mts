import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createGuestCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from '@voucha/test-helpers/copyright-notice-submissions'
import {
  reviewFormAndAssessCopyrightSubmission,
  readCopyrightAssessmentPointers,
} from '@voucha/test-helpers/copyright-form-review-assessment-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { observeTestPostgresClientQueries } from '@voucha/test-helpers/postgres-query-pool-observer'
import { readTestCopyrightFormReviewActor } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { readCopyrightCaseLifecycleClock } from '@voucha/test-helpers/copyright-lifecycle-clock'
import { reviewCopyrightFormIntake } from './form-reviews.mts'

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
    'preserves exact decision facts under %s-first overlap',
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
      const assessmentId = aggregate?.assessments[0]?.id ?? null
      const actor = await readTestCopyrightFormReviewActor(input.intakeId).catch((err: unknown) => {
        if (err instanceof Error && err.message.startsWith('Copyright form review was not found:'))
          return null
        throw err
      })
      const conflict = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({
          status: 409,
          code: 'CONFLICT',
          cause: expect.objectContaining({ code: '40001' }),
        }),
      })
      const reviewSuccess = expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({
          noticeId,
          submissionId: form.intake.copyright_notice_submission_id,
          is_accepted: false,
        }),
      })
      const assessmentSuccess = expect.objectContaining({
        status: 'fulfilled',
        value: expect.objectContaining({
          id: assessmentId,
          copyright_notice_submission_id: submission.id,
          assessed_by_id: currentUser.id,
          is_substantially_compliant: true,
        }),
      })
      const pointers = await readCopyrightAssessmentPointers(noticeId)
      const state = {
        reviewed,
        assessed,
        actor,
        assessments: aggregate?.assessments.map(row => ({
          submissionId: row.copyright_notice_submission_id,
          actorId: row.assessed_by_id,
          compliant: row.is_substantially_compliant,
        })),
        formPointer: pointers.find(row => row.id === form.intake.copyright_notice_submission_id)
          ?.current_assessment_identity_id,
        otherPointer: pointers.find(row => row.id === submission.id)
          ?.current_assessment_identity_id,
        events: aggregate?.lifecycleEvents
          .filter(event => event.change_type === 'submission_assessed')
          .map(event => event.copyright_notice_submission_assessment_identity_id),
      }
      expect([
        {
          reviewed: reviewSuccess,
          assessed: conflict,
          actor: currentUser.id,
          assessments: [
            {
              submissionId: form.intake.copyright_notice_submission_id,
              actorId: currentUser.id,
              compliant: false,
            },
          ],
          formPointer: assessmentId,
          otherPointer: null,
          events: [assessmentId],
        },
        {
          reviewed: conflict,
          assessed: assessmentSuccess,
          actor: null,
          assessments: [{ submissionId: submission.id, actorId: currentUser.id, compliant: true }],
          formPointer: null,
          otherPointer: assessmentId,
          events: [assessmentId],
        },
        {
          reviewed: conflict,
          assessed: conflict,
          actor: null,
          assessments: [],
          formPointer: null,
          otherPointer: null,
          events: [],
        },
      ]).toContainEqual(state)
    },
  )

  it('records the review without duplicating an existing matching human assessment', async () => {
    const { form, currentUser, input } = await createScene()
    const assessment = await seedCopyrightSubmissionAssessment({
      submissionId: form.intake.copyright_notice_submission_id,
      currentUser,
      assessedAt: new Date(),
      substantiallyCompliant: false,
    })
    const outcome = await reviewCopyrightFormIntake(input)
      .then(value => ({ status: 'fulfilled', value }))
      .catch((err: unknown) => ({ status: 'rejected', reason: err }))
    const aggregate = await getCopyrightNoticePrivateAggregate(form.intake.copyright_notice_id)
    const actor = await readTestCopyrightFormReviewActor(input.intakeId).catch((err: unknown) => {
      if (err instanceof Error && err.message.startsWith('Copyright form review was not found:'))
        return null
      throw err
    })
    expect([
      {
        outcome: expect.objectContaining({
          status: 'fulfilled',
          value: expect.objectContaining({ is_accepted: false }),
        }),
        actor: currentUser.id,
      },
      {
        outcome: expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({
            status: 409,
            code: 'CONFLICT',
            cause: expect.objectContaining({ code: '40001' }),
          }),
        }),
        actor: null,
      },
    ]).toContainEqual({ outcome, actor })
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
    let injected = false
    const outcome = await observeTestPostgresClientQueries(
      () => reviewCopyrightFormIntake(input),
      async query => {
        if (query.text.includes('/* reviewCopyrightFormIntake:review */')) {
          injected = true
          throw failure
        }
      },
    )
      .then(() => ({ error: undefined, injected }))
      .catch((err: unknown) => ({ error: err, injected }))
    expect([
      { error: failure, injected: true },
      {
        error: expect.objectContaining({
          status: 409,
          code: 'CONFLICT',
          cause: expect.objectContaining({ code: '40001' }),
        }),
        injected: false,
      },
    ]).toContainEqual(outcome)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    await expect(readTestCopyrightFormReviewActor(input.intakeId)).rejects.toThrow(
      'Copyright form review was not found:',
    )
    expect(aggregate?.assessments).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([])
    expect(await readCopyrightCaseLifecycleClock(noticeId)).toEqual(before)
  })
})
