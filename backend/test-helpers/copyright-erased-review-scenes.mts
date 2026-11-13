import { createTestRetiredCopyrightAssessment } from './copyright-retired-assessment.mts'
import { appendTestCopyrightFormScreening } from './copyright-form-screenings.mts'
import { createTestUser, insertTestImage, insertTestPost, insertTestPostImage } from './index.mts'
import {
  createTestCopyrightFormRejectionByErasedModerator,
  readTestCopyrightFormReviewActor,
} from './data-stores/psql/copyright-form-reviews.mts'
import { createCopyrightFormIntake } from '../services/copyright-notices/form-intakes.mts'
import { seedCopyrightSubmissionAssessment } from './copyright-notice-submissions.mts'
import { testCopyrightFormGuidance } from './services/copyright-notices/form-guidance.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import { expect } from 'vitest'
export async function createErasedReviewScene(historyRetired = false) {
  const claimant = await createTestUser()
  const postId = await insertTestPost({
    title: `erased copyright reviewer ${crypto.randomUUID()}`,
    slug: `erased-copyright-reviewer-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightFormIntake({
    currentUser: claimant,
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
      claimantTargets: [
        {
          surfaceKind: 'post-image' as const,
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  })
  const screeningId = await appendTestCopyrightFormScreening({
    intakeId: notice.intake.id,
    inputSha256: Buffer.alloc(32),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam markers.',
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  const assessment = historyRetired
    ? await createTestRetiredCopyrightAssessment({
        submissionId: notice.intake.copyright_notice_submission_id,
        screeningId,
      })
    : await seedCopyrightSubmissionAssessment({
        submissionId: notice.intake.copyright_notice_submission_id,
        assessedAt: new Date(),
        currentUser: null,
        substantiallyCompliant: true,
        copyrightFormScreeningId: screeningId,
      })
  return { assessment, notice, claimant }
}

export async function rejectErasedReviewScene(intakeId: string): Promise<void> {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  await createTestCopyrightFormRejectionByErasedModerator({ intakeId, moderatorId: moderator.id })
  await expect(readTestCopyrightFormReviewActor(intakeId)).resolves.toBeNull()
}

export async function seedErasedReviewRestriction(
  scene: Awaited<ReturnType<typeof createErasedReviewScene>>,
) {
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const aggregate = (await getCopyrightNoticePrivateAggregate(
    scene.notice.intake.copyright_notice_id,
  ))!
  const target = aggregate.targets[0]!
  return seedCopyrightStatementRestriction({
    noticeId: aggregate.notice.id,
    targetId: target.id,
    assessmentId: scene.assessment.id,
    revision: target.placement_revision,
    moderatorId: moderator.id,
    automated: true,
    reviewed: false,
  })
}
