import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '../../index.mts'
import { createCopyrightFormIntake } from '../../../services/copyright-notices/form-intakes.mts'
import {
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
} from '../../../services/copyright-notices/index.mts'
import { createTestCopyrightStaff } from './guest-capability.mts'

/** Files a form notice as a guest or a signed-in member, with the claimant email on the notice. */
export async function fileTestCopyrightFormNotice(signedIn: boolean): Promise<{
  noticeId: string
  claimantEmail: string
}> {
  const filer = await createTestUser()
  const claimantEmail = `tests+claimant-${crypto.randomUUID()}@voucha.ai`
  const postId = await insertTestPost({
    title: `information request ${crypto.randomUUID()}`,
    slug: `information-request-${crypto.randomUUID()}`,
    createdById: filer.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(filer.id)
  await insertTestPostImage({ postId, imageId })
  const { intake } = await createCopyrightFormIntake({
    requesterUserId: signedIn ? filer.id : null,
    requesterIdentity: signedIn ? `user:${filer.id}` : `guest:${crypto.randomUUID()}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'Phone 555-0100',
      claimantEmail,
      workDescription: 'Claimed work',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
    },
  })
  return { noticeId: intake.copyright_notice_id, claimantEmail }
}

/** Staff issue a guest capability and use it to send an information request on the notice. */
export async function requestTestCopyrightInformation(
  noticeId: string,
  statement: string,
): Promise<{ id: string }> {
  const staff = await createTestCopyrightStaff()
  const capability = await issueCopyrightGuestCapability({
    currentUser: staff,
    noticeId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return requestCopyrightGuestInformation({
    currentUser: staff,
    noticeId,
    capabilityId: capability.id,
    statement,
  })
}
