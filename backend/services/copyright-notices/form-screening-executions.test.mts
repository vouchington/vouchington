import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  readTestCopyrightScreeningExecution,
  readTestCopyrightStaffScreening,
  getTestExpiredCopyrightScreeningClaimTime,
  startTestCopyrightScreeningBeforeAdmission,
} from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import {
  createTestCopyrightFormIntakeReview,
  readTestLatestCopyrightFormScreeningRecommendation,
} from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import {
  claimCopyrightFormScreening,
  type CopyrightFormScreeningAttempt,
  completeCopyrightFormScreening,
  failCopyrightFormScreening,
} from './form-screening-executions.mts'
import { reviewCopyrightFormIntake } from './form-reviews.mts'

describe('current copyright form screening execution', () => {
  it('fences stale completion and replays the current result after a failed retry', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const old = (await claimCopyrightFormScreening(intake.id))!
    await failCopyrightFormScreening(old)
    const current = (await claimCopyrightFormScreening(intake.id))!
    const input = {
      intakeId: intake.id,
      inputSha256: Buffer.alloc(32, 1),
      recommendation: 'invalid_or_spam' as const,
      rationale: 'Invalid current screen.',
      guidance: testCopyrightFormGuidance,
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    }
    await expect(
      completeCopyrightFormScreening(old, { ...input, recommendation: 'not_obviously_invalid' }),
    ).resolves.toBeNull()
    const result = await completeCopyrightFormScreening(current, input)
    expect(result).toBeTypeOf('string')
    await expect(completeCopyrightFormScreening(current, input)).resolves.toBe(result)
    await failCopyrightFormScreening(old)
    await expect(readTestLatestCopyrightFormScreeningRecommendation(intake.id)).resolves.toBe(
      'invalid_or_spam',
    )
  })

  it.each([1, 2])(
    'persists a single winner for concurrent claims of attempt %i',
    async attemptNumber => {
      const { intake } = await createSignedInCopyrightForm()
      if (attemptNumber === 2) {
        const initial = await claimCopyrightFormScreening(intake.id)
        if (!initial) throw new Error('Initial screening claim was not created')
        await failCopyrightFormScreening(initial)
      }
      const winner = Promise.withResolvers<CopyrightFormScreeningAttempt>()
      const restore = afterPostgresTransactionQueryForTest(
        'claimCopyrightFormScreening:current',
        values => values.includes(intake.id),
        async () => {
          const claim = await claimCopyrightFormScreening(intake.id)
          if (!claim) throw new Error('Competing screening claim was not created')
          winner.resolve(claim)
        },
      )
      try {
        await expect(claimCopyrightFormScreening(intake.id)).resolves.toBeNull()
      } finally {
        restore()
      }
      const { leaseToken } = await winner.promise
      await expect(readTestCopyrightScreeningExecution(intake.id)).resolves.toMatchObject({
        attempt_number: attemptNumber,
        state: 'pending',
        execution_token: leaseToken,
        lease_token: leaseToken,
      })
      await expect(claimCopyrightFormScreening(intake.id)).resolves.toBeNull()
    },
  )

  it('rotates an expired claim and fences its late output', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const old = (await claimCopyrightFormScreening(intake.id))!
    const cutoff = await getTestExpiredCopyrightScreeningClaimTime(intake.id)
    const retry = await claimCopyrightFormScreening(intake.id, cutoff)
    expect(retry?.leaseToken).not.toBe(old.leaseToken)
    expect(retry?.attemptNumber).toBe(old.attemptNumber + 1)
    const input = {
      intakeId: intake.id,
      inputSha256: Buffer.alloc(32, 1),
      recommendation: 'not_obviously_invalid' as const,
      rationale: 'Late output.',
      guidance: testCopyrightFormGuidance,
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    }
    await expect(completeCopyrightFormScreening(old, input)).resolves.toBeNull()
    await failCopyrightFormScreening(old)
    const result = await completeCopyrightFormScreening(retry!, input)
    expect(result).toBeTypeOf('string')
    await failCopyrightFormScreening(old)
    await expect(completeCopyrightFormScreening(retry!, input)).resolves.toBe(result)
  })

  it('serializes a failed-screen retry before admitting a human-authorized restriction', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const initial = (await claimCopyrightFormScreening(intake.id))!
    await failCopyrightFormScreening(initial)
    const user = await createTestUser({ extraRoles: ['moderator'] })
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: user.id,
      is_accepted: true,
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: user,
      substantiallyCompliant: true,
    })
    expect(assessment.copyright_notice_form_screening_id).toBeNull()
    const [targetId] = await readCopyrightNoticeTargetIds(intake.copyright_notice_id)
    const restriction = await startTestCopyrightScreeningBeforeAdmission(intake.id, () =>
      acceptCopyrightNoticeAndImposeRestriction({
        noticeId: intake.copyright_notice_id,
        targetId: targetId!,
        assessmentId: assessment.id,
        imposedAt: new Date(),
        imposedById: user.id,
      }),
    )
    expect(restriction).toMatchObject({
      authorizing_assessment_id: assessment.id,
      imposed_by_id: user.id,
    })
    await expect(
      readTestCopyrightStaffScreening(intake.copyright_notice_id),
    ).resolves.toMatchObject({ state: 'pending' })
    await expect(
      countCopyrightActiveRestrictionsForNotice(intake.copyright_notice_id),
    ).resolves.toBe(1)
  })

  it('staff approval creates human authority during failed screening', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const initial = (await claimCopyrightFormScreening(intake.id))!
    await failCopyrightFormScreening(initial)
    const user = await createTestUser()
    await reviewCopyrightFormIntake({
      intakeId: intake.id,
      currentUser: { ...user, roles: ['moderator'] },
      is_accepted: true,
      rationale: 'Human statutory review.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id)
    expect(aggregate?.assessments.at(-1)).toMatchObject({
      copyright_notice_form_screening_id: null,
      assessed_by_id: user.id,
      is_substantially_compliant: true,
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(intake.copyright_notice_id),
    ).resolves.toBe(1)
  })
})
