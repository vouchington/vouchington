import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import { appendCopyrightFormScreening } from '../../../services/copyright-notices/form-screenings.mts'

export async function createClearScreenedForm(targetCount = 1) {
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
