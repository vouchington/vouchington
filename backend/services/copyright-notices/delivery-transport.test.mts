import { appendTestCopyrightFormScreening } from '@voucha/test-helpers/copyright-form-screenings'
import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import {
  createTestUser,
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  createTestLiftNotice,
  readTestLiftDeliveryIntents,
} from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { createCopyrightFormIntake, prepareCopyrightEmailDelivery } from './index.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'

async function createRestrictedNotice(poster: Awaited<ReturnType<typeof createTestUser>>) {
  const claimant = await createTestUser()
  const claimantEmail = `tests+claimant-${crypto.randomUUID()}@voucha.ai`
  const postId = await insertTestPost({
    title: `copyright transport ${crypto.randomUUID()}`,
    slug: `copyright-transport-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  const intake = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: claimantEmail,
      claimantEmail,
      workDescription: 'Claimed photograph',
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
  await appendTestCopyrightFormScreening({
    intakeId: intake.intake.id,
    inputSha256: Buffer.alloc(32, 4),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam or invalidity.',
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  await applyNonSpamSignedInCopyrightFormScreening(intake.intake.copyright_notice_submission_id)
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  const intent = aggregate?.deliveryIntents.find(
    item => item.delivery_kind === 'poster_restriction_notice' && item.channel === 'email',
  )
  const claimantReceipt = aggregate?.deliveryIntents.find(
    item => item.delivery_kind === 'claimant_receipt' && item.channel === 'email',
  )
  if (!intent) throw new Error('poster restriction email intent missing')
  if (!claimantReceipt) throw new Error('claimant receipt email intent missing')
  return {
    noticeId: intake.intake.copyright_notice_id,
    intentId: intent.id,
    claimantReceiptIntentId: claimantReceipt.id,
    claimantEmail,
  }
}

describe('copyright email delivery transport', () => {
  useAutomaticProvisionalWithholding()

  it('prepares a poster restriction email from the member verified address', async () => {
    const poster = await createTestUser()
    const { intentId } = await createRestrictedNotice(poster)

    await expect(prepareCopyrightEmailDelivery(intentId)).resolves.toMatchObject({
      subject: 'Your image was restricted after a copyright notice',
      recipientEmail: expect.stringMatching(/@/),
    })
  })

  it('prepares a signed-in claimant receipt with its retained address', async () => {
    const poster = await createTestUser()
    const { claimantReceiptIntentId, claimantEmail } = await createRestrictedNotice(poster)

    await expect(prepareCopyrightEmailDelivery(claimantReceiptIntentId)).resolves.toMatchObject({
      deliveryKind: 'claimant_receipt',
      recipientEmail: claimantEmail,
      text: expect.any(String),
    })
  })

  it('fails closed for an owned claimant email intent without a retained recipient', async () => {
    const poster = await createTestUser()
    const { noticeId } = await createRestrictedNotice(poster)
    const bodyText = `Claimant receipt ${crypto.randomUUID()}`
    await using transaction = await beginTransaction()
    const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
      {
        noticeId,
        submissionId: null,
        correspondenceKind: 'receipt',
        bodyText,
      },
      transaction,
    )
    const intent = await createCopyrightDeliveryIntent(
      {
        noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: null,
        recipientRole: 'claimant',
        deliveryKind: 'claimant_receipt',
        channel: 'email',
        idempotencyKey: `copyright-claimant-without-recipient-${crypto.randomUUID()}`,
      },
      transaction,
    )
    await transaction.commit()

    await expect(prepareCopyrightEmailDelivery(intent.id)).rejects.toMatchObject({
      status: 422,
      message: 'Copyright email delivery has no private recipient',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({ id: intent.id, state: 'pending' }),
    )
  })

  it('prepares an informed community owner email through their verified account address', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image', {
      actorModerator: true,
      actorWithEmail: true,
    })
    const owner = await createTestUserDirect({ withEmail: true })
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: owner.id,
      role: 'owner',
    })
    const { noticeId } = await createTestLiftNotice([fixture], {
      claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
    })
    const intent = (await readTestLiftDeliveryIntents(noticeId)).find(
      item =>
        item.recipient_user_id === owner.id &&
        item.recipient_role === 'informed_owner' &&
        item.delivery_kind === 'owner_information_notice' &&
        item.channel === 'email',
    )
    if (!intent) throw new Error('informed community owner email intent missing')
    const ownerEmail = owner.email_address
    if (!ownerEmail) throw new Error('Community owner fixture missing verified email')
    await expect(prepareCopyrightEmailDelivery(intent.id)).resolves.toMatchObject({
      deliveryKind: 'owner_information_notice',
      recipientEmail: ownerEmail,
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
