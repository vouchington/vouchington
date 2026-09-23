import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  ageTestCopyrightEnforcementRequest,
  createTestCopyrightFormIntakeReview,
  liftTestCopyrightRestriction,
  readTestLatestCopyrightFormScreeningRecommendation,
} from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  getPendingCopyrightAgentDispatches,
  reconcileCopyrightEnforcementRequests,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'
import { recoverRejectedCopyrightFormReviewEffects } from './form-reviews-recovery.mts'

async function createClearScreenedForm(targetCount = 1) {
  const claimant = await createTestUser()
  const postId = await insertTestPost({
    title: `copyright screen recovery ${crypto.randomUUID()}`,
    slug: `copyright-screen-recovery-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageIds = await Promise.all(
    Array.from({ length: targetCount }, () => insertTestImage(claimant.id)),
  )
  await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
  const notice = await createCopyrightFormIntake({
    requesterUserId: claimant.id,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'Original photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: imageIds.map(imageId => ({
        postId,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      })),
    },
  })
  const screeningId = await appendCopyrightFormScreening({
    intakeId: notice.intake.id,
    inputSha256: Buffer.alloc(32, targetCount),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam markers.',
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  return { notice, screeningId }
}

async function expectFormEffect(submissionId: string): Promise<void> {
  await vi.waitFor(async () => {
    await expect(getPendingCopyrightAgentDispatches()).resolves.toContainEqual({
      kind: 'form-effect',
      submissionId,
    })
  })
}

async function expectNoFormEffect(submissionId: string): Promise<void> {
  await vi.waitFor(async () => {
    await expect(getPendingCopyrightAgentDispatches()).resolves.not.toContainEqual({
      kind: 'form-effect',
      submissionId,
    })
  })
}

describe('copyright form-screening recovery', () => {
  it('repairs a saved clear screen through its effect, without another screening run', async () => {
    const { notice } = await createClearScreenedForm()
    await expectFormEffect(notice.intake.copyright_notice_submission_id)

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    await expectNoFormEffect(notice.intake.copyright_notice_submission_id)
  })

  it('does not recover an earlier clear screen after a newer invalid result', async () => {
    const { notice } = await createClearScreenedForm()
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 99),
      recommendation: 'invalid_or_spam',
      rationale: 'The latest input is invalid.',
      promptVersion: 'copyright-form-screening-v3',
      model: 'test-model',
    })
    await expect(
      readTestLatestCopyrightFormScreeningRecommendation(notice.intake.id),
    ).resolves.toBe('invalid_or_spam')

    await expectNoFormEffect(notice.intake.copyright_notice_submission_id)
  })

  it('repairs an unprocessed target while retaining a lifted target', async () => {
    const { notice, screeningId } = await createClearScreenedForm(2)
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const [firstTarget, secondTarget] = await readCopyrightNoticeTargetIds(
      notice.intake.copyright_notice_id,
    )
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.intake.copyright_notice_id,
      targetId: firstTarget!,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    const partial = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    await liftTestCopyrightRestriction(partial!.restrictions[0]!.id)
    await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 98),
      recommendation: 'not_obviously_invalid',
      rationale: 'A later clear screening supersedes the first.',
      promptVersion: 'copyright-form-screening-v3',
      model: 'test-model',
    })

    await expectFormEffect(notice.intake.copyright_notice_submission_id)
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
    const recovered = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(recovered?.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_notice_target_id: firstTarget,
          lifted_at: expect.any(Date),
        }),
        expect.objectContaining({ copyright_notice_target_id: secondTarget, lifted_at: null }),
      ]),
    )
  })

  it('keeps a rejected review authoritative after its downstream crash window', async () => {
    const [{ notice }, moderator] = await Promise.all([createClearScreenedForm(), createTestUser()])
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
    await createTestCopyrightFormIntakeReview({
      intakeId: notice.intake.id,
      moderatorId: moderator.id,
      accepted: false,
    })

    await reconcileCopyrightEnforcementRequests(0)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments.at(-1)).toMatchObject({
      assessed_by_id: moderator.id,
      substantially_compliant: false,
    })
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([expect.objectContaining({ human_review_action: 'reverse' })]),
    )
    await expectNoFormEffect(notice.intake.copyright_notice_submission_id)
  })

  it('processes an owned pending enforcement request during reconciliation', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    await ageTestCopyrightEnforcementRequest(assessment.id)

    await expect(reconcileCopyrightEnforcementRequests(1)).resolves.toBe(1)
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
  })

  it('recovers a rejection committed before any assessment', async () => {
    const [{ notice }, moderator] = await Promise.all([createClearScreenedForm(), createTestUser()])
    await createTestCopyrightFormIntakeReview({
      intakeId: notice.intake.id,
      moderatorId: moderator.id,
      accepted: false,
    })

    await recoverRejectedCopyrightFormReviewEffects()

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual([
      expect.objectContaining({
        assessed_by_id: moderator.id,
        substantially_compliant: false,
      }),
    ])
    await expectNoFormEffect(notice.intake.copyright_notice_submission_id)
  })

  it('does not overwrite a current human rejection with automated screening', async () => {
    const [{ notice }, moderatorRecord] = await Promise.all([
      createClearScreenedForm(),
      createTestUser(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: false,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })
})
