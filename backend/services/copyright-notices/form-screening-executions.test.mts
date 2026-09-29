import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestLatestCopyrightFormScreeningRecommendation } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import {
  readTestCopyrightStaffScreening,
  expireTestCopyrightScreeningClaim,
  startTestCopyrightScreeningBeforeAdmission,
  admitTestCopyrightBeforeScreening,
} from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import {
  createClearScreenedForm,
  isTestCopyrightStaffCaseQueued,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  getCopyrightNoticePrivateAggregate,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'
import {
  startCopyrightFormScreening,
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
  failCopyrightFormScreening,
} from './form-screening-executions.mts'
import { claimCopyrightEnforcementRequest } from './enforcement-request-claim.mts'
import { reviewCopyrightFormIntake } from './form-reviews.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'

describe('current copyright form screening execution', () => {
  useAutomaticProvisionalWithholding()

  it('commits admission ahead of a waiting new screen and retains its action intent', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const [targetId] = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    const restriction = await admitTestCopyrightBeforeScreening(
      notice.intake.copyright_notice_id,
      notice.intake.id,
      () =>
        acceptCopyrightNoticeAndImposeRestriction({
          noticeId: notice.intake.copyright_notice_id,
          targetId: targetId!,
          assessmentId: assessment.id,
          imposedAt: new Date(),
          imposedById: null,
        }),
    )
    await expect(
      readTestCopyrightStaffScreening(notice.intake.copyright_notice_id),
    ).resolves.toEqual({
      state: 'pending',
      recommendation: null,
      rationale: null,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.restrictions.find(item => item.id === restriction.id)?.lifted_at).toBeNull()
    expect(
      aggregate?.actionIntents.some(item => item.copyright_restriction_id === restriction.id),
    ).toBe(true)
  })
  it('keeps a newer invalid screen visible after an earlier clear screen', async () => {
    const [{ notice }, user] = await Promise.all([createClearScreenedForm(), createTestUser()])
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 99),
      recommendation: 'invalid_or_spam',
      rationale: 'Latest screening is invalid.',
      promptVersion: 'copyright-form-screening-v3',
      model: 'test-model',
    })
    await expect(
      isTestCopyrightStaffCaseQueued(notice.intake.copyright_notice_id, {
        ...user,
        roles: ['moderator'],
      }),
    ).resolves.toBe(true)
  })
  it('blocks stale clear authority on new pending and failed screening while exposing current state', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const submissionId = notice.intake.copyright_notice_submission_id
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const attempt = await startCopyrightFormScreening(notice.intake.id)
    const [targetId] = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    for (const state of ['pending', 'failed']) {
      if (state === 'failed') await failCopyrightFormScreening(attempt)
      expect(await readTestCopyrightStaffScreening(notice.intake.copyright_notice_id)).toEqual({
        state,
        recommendation: null,
        rationale: null,
      })
      expect(await readTestPendingCopyrightAgentDispatches(submissionId)).toEqual([
        { kind: 'form-screening', submissionId },
      ])
      await applyNonSpamSignedInCopyrightFormScreening(submissionId)
      await expect(
        acceptCopyrightNoticeAndImposeRestriction({
          noticeId: notice.intake.copyright_notice_id,
          targetId: targetId!,
          assessmentId: assessment.id,
          imposedAt: new Date(),
          imposedById: null,
        }),
      ).rejects.toThrow('Copyright screening authority is not current')
      await expect(
        countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
      ).resolves.toBe(0)
    }
    await expect(claimCopyrightEnforcementRequest(assessment.id)).resolves.toBe('completed')
  })

  it('fences duplicate completion and stale success/failure without caching identical input', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const old = await startCopyrightFormScreening(notice.intake.id)
    const current = await startCopyrightFormScreening(notice.intake.id)
    const input = {
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 1),
      recommendation: 'invalid_or_spam' as const,
      rationale: 'Invalid current screen.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    }
    await expect(
      completeCopyrightFormScreening(old, { ...input, recommendation: 'not_obviously_invalid' }),
    ).resolves.toBeNull()
    const result = await completeCopyrightFormScreening(current, input)
    expect(result).not.toBe(screeningId)
    await expect(completeCopyrightFormScreening(current, input)).resolves.toBe(result)
    await failCopyrightFormScreening(old)
    await expect(
      readTestLatestCopyrightFormScreeningRecommendation(notice.intake.id),
    ).resolves.toBe('invalid_or_spam')
  })

  it('claims one live attempt and rotates failed retry tokens', async () => {
    const { notice } = await createClearScreenedForm()
    const started = await startCopyrightFormScreening(notice.intake.id)
    await expect(claimCopyrightFormScreening(notice.intake.id)).resolves.toEqual(started)
    await expect(claimCopyrightFormScreening(notice.intake.id)).resolves.toBeNull()
    await failCopyrightFormScreening(started)
    await expect(claimCopyrightFormScreening(notice.intake.id)).resolves.toEqual({
      intakeId: started.intakeId,
      attemptNumber: started.attemptNumber + 1,
    })
  })

  it('rotates an expired claim and fences its late output', async () => {
    const { notice } = await createClearScreenedForm()
    const old = await startCopyrightFormScreening(notice.intake.id)
    await claimCopyrightFormScreening(notice.intake.id)
    await expireTestCopyrightScreeningClaim(notice.intake.id)
    const retry = await claimCopyrightFormScreening(notice.intake.id)
    expect(retry?.attemptNumber).toBe(old.attemptNumber + 1)
    await expect(
      completeCopyrightFormScreening(old, {
        intakeId: notice.intake.id,
        inputSha256: Buffer.alloc(32, 1),
        recommendation: 'not_obviously_invalid',
        rationale: 'Late output.',
        promptVersion: 'copyright-form-screening-v2',
        model: 'test-model',
      }),
    ).resolves.toBeNull()
  })

  it('serializes new pending authority ahead of already-started admission through the PostgreSQL form fence', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const [targetId] = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    await expect(
      startTestCopyrightScreeningBeforeAdmission(notice.intake.id, () =>
        acceptCopyrightNoticeAndImposeRestriction({
          noticeId: notice.intake.copyright_notice_id,
          targetId: targetId!,
          assessmentId: assessment.id,
          imposedAt: new Date(),
          imposedById: null,
        }),
      ),
    ).rejects.toThrow('Copyright screening authority is not current')
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })

  it('retains an admitted target while pending blocks the remaining target and a new clear repairs it', async () => {
    const { notice, screeningId } = await createClearScreenedForm(2)
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const [first, second] = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    const input = {
      noticeId: notice.intake.copyright_notice_id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    }
    await acceptCopyrightNoticeAndImposeRestriction({ ...input, targetId: first! })
    const attempt = await startCopyrightFormScreening(notice.intake.id)
    await expect(
      acceptCopyrightNoticeAndImposeRestriction({ ...input, targetId: second! }),
    ).rejects.toThrow('Copyright screening authority is not current')
    await failCopyrightFormScreening(attempt)
    await expect(countCopyrightActiveRestrictionsForNotice(input.noticeId)).resolves.toBe(1)
    await completeCopyrightFormScreening(await startCopyrightFormScreening(notice.intake.id), {
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 2),
      recommendation: 'not_obviously_invalid',
      rationale: 'Current clear.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    await expect(countCopyrightActiveRestrictionsForNotice(input.noticeId)).resolves.toBe(2)
  })

  it('staff approval creates human authority during failed screening instead of reusing stale automatic approval', async () => {
    const [{ notice, screeningId }, user] = await Promise.all([
      createClearScreenedForm(),
      createTestUser(),
    ])
    const submissionId = notice.intake.copyright_notice_submission_id
    const previous = await appendCopyrightSubmissionAssessment({
      submissionId,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    await failCopyrightFormScreening(await startCopyrightFormScreening(notice.intake.id))
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: { ...user, roles: ['moderator'] },
      accepted: true,
      rationale: 'Human statutory review.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments.at(-1)).toMatchObject({
      supersedes_assessment_id: previous.id,
      copyright_notice_form_screening_id: null,
      assessed_by_id: user.id,
      substantially_compliant: true,
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
  })
})
