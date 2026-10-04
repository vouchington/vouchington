import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createCopyrightEmailIntake,
  createCopyrightFormIntake,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
} from '@services/copyright-notices'
import { processSendCopyrightNoticeEmail } from './copyright-notice.mts'
import { readTestCopyrightResponseFailure } from '@voucha/test-helpers/copyright-lease-fencing'
import { readCopyrightEmailIntakeResponses } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

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
    currentUser: claimant,
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
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  const intent = aggregate?.deliveryIntents.find(intent => intent.channel === 'email')
  if (!intent) throw new Error('fixture email delivery intent missing')
  return { intentId: intent.id, noticeId: intake.intake.copyright_notice_id }
}

async function createEmailIntakeResponse(): Promise<{ intentId: string; intakeId: string }> {
  const moderatorRecord = await createTestUser()
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const sesMessageId = `ses-intake-response-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 9),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
    subject: 'Copyright complaint',
    bodyText: 'A copyright complaint.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  const rejected = await rejectCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message needs more statutory information.',
    responseKind: 'needs_information',
    responseMessage: 'Please identify the work and material.',
  })
  if (!rejected.responseId) throw new Error('email response fixture missing')
  return { intentId: rejected.responseId, intakeId: intake.id }
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

  it('sends a claimed staff response to a rejected inbound copyright email', async () => {
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({
      MessageId: `ses-${crypto.randomUUID()}`,
    } as never)
    const { intentId, intakeId } = await createEmailIntakeResponse()

    await expect(processSendCopyrightNoticeEmail({ intentId })).resolves.toBe(true)
    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'More information is needed for your copyright notice',
        text: expect.stringContaining('Please identify the work and material.'),
        allowGlobalBcc: false,
      }),
    )
    await expect(readCopyrightEmailIntakeResponses(intakeId)).resolves.toEqual([
      { id: intentId, delivery_kind: 'email_intake_needs_information', state: 'sent' },
    ])
  })

  it('retries a claimed intake response when SES omits its MessageId', async () => {
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
    const { intentId } = await createEmailIntakeResponse()

    await expect(processSendCopyrightNoticeEmail({ intentId })).rejects.toThrow(
      'SES accepted copyright email without a MessageId',
    )

    await expect(readTestCopyrightResponseFailure(intentId)).resolves.toMatchObject({
      state: 'pending',
      attempts: 1,
      failure: 'SES accepted copyright email without a MessageId',
    })
  })
})
