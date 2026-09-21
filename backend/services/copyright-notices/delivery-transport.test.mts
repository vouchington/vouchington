import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  prepareCopyrightEmailDelivery,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'

async function createRestrictedNotice(poster: Awaited<ReturnType<typeof createTestUser>>) {
  const claimant = await createTestUser()
  const postId = await insertTestPost({
    title: `copyright transport ${crypto.randomUUID()}`,
    slug: `copyright-transport-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  const intake = await createCopyrightFormIntake({
    requesterUserId: claimant.id,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: `tests+claimant-${crypto.randomUUID()}@voucha.ai`,
      claimantEmail: `tests+claimant-${crypto.randomUUID()}@voucha.ai`,
      workDescription: 'Claimed photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
    },
  })
  await appendCopyrightFormScreening({
    intakeId: intake.intake.id,
    inputSha256: Buffer.alloc(32, 4),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam or invalidity.',
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  await applyNonSpamSignedInCopyrightFormScreening(intake.intake.copyright_notice_submission_id)
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  const intent = aggregate?.deliveryIntents.find(
    item => item.delivery_kind === 'poster_restriction_notice' && item.channel === 'email',
  )
  if (!intent) throw new Error('poster restriction email intent missing')
  return { noticeId: intake.intake.copyright_notice_id, intentId: intent.id }
}

describe('copyright email delivery transport', () => {
  it('prepares a poster restriction email from the member verified address', async () => {
    const poster = await createTestUser()
    const { intentId } = await createRestrictedNotice(poster)

    await expect(prepareCopyrightEmailDelivery(intentId)).resolves.toMatchObject({
      subject: 'Copyright notice affecting your material',
      recipientEmail: expect.stringMatching(/@/),
    })
  })

  it('marks a claimed poster email failed when the member has no verified address', async () => {
    const poster = await createTestUserDirect()
    const { noticeId, intentId } = await createRestrictedNotice(poster)

    await expect(prepareCopyrightEmailDelivery(intentId)).rejects.toThrow(
      'Affected poster has no verified email address',
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({ id: intentId, state: 'pending' }),
    )
  })
})
