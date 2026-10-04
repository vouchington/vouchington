import { randomBytes, randomUUID } from 'node:crypto'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from '../../../services/copyright-notices/form-screenings.mts'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import { testCopyrightFormGuidance } from './form-guidance.mts'

/**
 * A signed-in claimant files a form about a post by `posterId`, and the screening finds nothing
 * obviously invalid, so with automatic provisional withholding the target is restricted.
 */
export async function createRetentionSignedInForm(posterId: string) {
  const claimant = await createTestUser()
  const imageId = await insertTestImage(posterId)
  const postId = await insertTestPost({
    title: `retention form ${randomUUID()}`,
    slug: `retention-form-${randomUUID()}`,
    createdById: posterId,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const { intake } = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant Name',
      claimantContact: `claimant-${randomUUID()}@example.test`,
      claimantEmail: `claimant-${randomUUID()}@example.test`,
      workDescription: `Original photograph ${randomUUID()}`,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant Name',
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
  await appendCopyrightFormScreening({
    intakeId: intake.id,
    inputSha256: randomBytes(32),
    recommendation: 'not_obviously_invalid',
    rationale: `No obvious spam ${randomUUID()}.`,
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  await applyNonSpamSignedInCopyrightFormScreening(intake.copyright_notice_submission_id)
  return intake
}
