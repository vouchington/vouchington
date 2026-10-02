import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import { appendCopyrightFormScreening } from '../../../services/copyright-notices/form-screenings.mts'
import {
  type CopyrightStaffQueueCursor,
  listCopyrightStaffQueue,
} from '../../../services/copyright-notices/read-models-staff.mts'
import { readCopyrightStaffQueueCursorRows } from '../../data-stores/psql/copyright-notice-reads.mts'
import { testCopyrightFormGuidance } from './form-guidance.mts'

export async function isTestCopyrightStaffCaseQueued(
  noticeId: string,
  currentUser: Parameters<typeof listCopyrightStaffQueue>[0],
): Promise<boolean> {
  const [key] = await readCopyrightStaffQueueCursorRows([noticeId])
  if (!key) return false
  let after: CopyrightStaffQueueCursor = {
    tier: key.urgency,
    timestamp: key.waiting_since_before,
    id: key.id,
  }
  for (;;) {
    const page = await listCopyrightStaffQueue(currentUser, { limit: 100, after })
    if (page.cases.some(item => item.id === noticeId)) return true
    if (!page.hasNextPage || !page.endCursor) return false
    after = page.endCursor
  }
}

export async function createClearScreenedForm(targetCount = 1) {
  const notice = await createSignedInCopyrightForm(targetCount)
  const screeningId = await appendCopyrightFormScreening({
    intakeId: notice.intake.id,
    inputSha256: Buffer.alloc(32, targetCount),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam markers.',
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  return { notice, screeningId }
}

/** A complete signed-in structured form whose screening has not run yet. */
export async function createSignedInCopyrightForm(targetCount = 1) {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const postId = await insertTestPost({
    title: `copyright screen recovery ${crypto.randomUUID()}`,
    slug: `copyright-screen-recovery-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageIds = await Promise.all(
    Array.from({ length: targetCount }, () => insertTestImage(poster.id)),
  )
  await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
  return createCopyrightFormIntake({
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
      claimantTargets: imageIds.map(imageId => ({
        postId,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      })),
    },
  })
}
