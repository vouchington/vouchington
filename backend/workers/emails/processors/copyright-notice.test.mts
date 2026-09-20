import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
} from '@services/copyright-notices'
import { processSendCopyrightNoticeEmail } from './copyright-notice.mts'

async function createEmailDeliveryIntent(): Promise<{ intentId: string; noticeId: string }> {
  const claimant = await createTestUser()
  const postId = await insertTestPost({
    title: `copyright delivery ${crypto.randomUUID()}`,
    slug: `copyright-delivery-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
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
      workDescription: 'Claimed work',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
    },
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  const intent = aggregate?.deliveryIntents.find(intent => intent.channel === 'email')
  if (!intent) throw new Error('fixture email delivery intent missing')
  return { intentId: intent.id, noticeId: intake.intake.copyright_notice_id }
}

describe('processSendCopyrightNoticeEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail')
  })

  it('records SES acceptance and immutable correspondence delivery', async () => {
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({
      MessageId: `ses-${crypto.randomUUID()}`,
    } as never)
    const fixture = await createEmailDeliveryIntent()

    await expect(processSendCopyrightNoticeEmail({ intentId: fixture.intentId })).resolves.toBe(
      true,
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: expect.stringMatching(/^tests\+claimant-/),
        configurationSetName: process.env.SES_CONFIGURATION_SET_TRANSACTIONAL || undefined,
        allowGlobalBcc: false,
      }),
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({
        id: fixture.intentId,
        state: 'sent',
        ses_message_id: expect.any(String),
      }),
    )
    expect(aggregate?.correspondence).toContainEqual(
      expect.objectContaining({ sent_at: expect.any(Date), correspondence_kind: 'receipt' }),
    )
  })

  it('fails a claimed intent when SES omits its MessageId', async () => {
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    const fixture = await createEmailDeliveryIntent()

    await expect(processSendCopyrightNoticeEmail({ intentId: fixture.intentId })).rejects.toThrow(
      'SES accepted copyright email without a MessageId',
    )

    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({ id: fixture.intentId, state: 'pending', ses_message_id: null }),
    )
  })

  it('does nothing when the durable intent cannot be claimed', async () => {
    await expect(
      processSendCopyrightNoticeEmail({ intentId: '00000000-0000-7000-8000-000000000041' }),
    ).resolves.toBe(false)
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
