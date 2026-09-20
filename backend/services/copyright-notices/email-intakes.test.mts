import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createCopyrightEmailIntake,
  createCopyrightNoticeAggregate,
  getPendingCopyrightAgentDispatches,
  prepareCopyrightEmailIntakeResponseDelivery,
  promoteCopyrightEmailIntake,
  recordCopyrightEmailParse,
  rejectCopyrightEmailIntake,
} from './index.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { getCopyrightEmailIntakeForAgent } from './email-intake-parses.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('copyright email intake persistence', () => {
  it('keeps the source and advisory recommendation private and replay-safe', async () => {
    const sesMessageId = `ses-copyright-${crypto.randomUUID()}`
    const input = {
      sesMessageId,
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 1),
      rawMimeType: 'message/rfc822',
      rawByteSize: 123,
      fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
      subject: 'Copyright complaint',
      bodyText: 'This is a copyright complaint.',
      messageId: '<copyright@example.test>',
      replyReferences: [],
      attachments: [
        {
          filename: 'evidence.pdf',
          contentId: null,
          mimeType: 'application/pdf',
          byteSize: 12,
          sha256: Buffer.alloc(32, 2),
        },
      ],
    }
    const created = await createCopyrightEmailIntake(input)
    await recordCopyrightEmailParse(created.intake, {
      status: 'succeeded',
      fromEmail: input.fromEmail,
      subject: input.subject,
      bodyText: input.bodyText,
      messageId: input.messageId,
      replyReferences: input.replyReferences,
      attachments: input.attachments,
    })
    const replay = await createCopyrightEmailIntake(input)
    const intake = await getCopyrightEmailIntakeForAgent(created.intake.id)

    expect(created.isNew).toBe(true)
    expect(replay).toEqual({ intake: created.intake, isNew: false })
    expect(intake).toMatchObject({
      id: created.intake.id,
      senderEmail: input.fromEmail,
      bodyText: input.bodyText,
      attachments: [
        expect.objectContaining({ filename: 'evidence.pdf', sha256: Buffer.alloc(32, 2) }),
      ],
    })
    await expect(getPendingCopyrightAgentDispatches()).resolves.toContainEqual({
      kind: 'email',
      intakeId: created.intake.id,
    })
    await expect(
      appendCopyrightEmailIntakeRecommendation({
        intakeId: created.intake.id,
        inputSha256: Buffer.alloc(32, 3),
        promptVersion: 'copyright-email-intake-v1',
        model: 'test-model',
        structuredOutput: { recommendation: 'potentially_valid' },
      }),
    ).resolves.toBe(true)
    await expect(
      appendCopyrightEmailIntakeRecommendation({
        intakeId: created.intake.id,
        inputSha256: Buffer.alloc(32, 3),
        promptVersion: 'copyright-email-intake-v1',
        model: 'test-model',
        structuredOutput: { recommendation: 'potentially_valid' },
      }),
    ).resolves.toBe(false)
  })

  it('keeps failed MIME parses for staff without dispatching the extraction agent', async () => {
    const sesMessageId = `ses-malformed-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 5),
      rawMimeType: 'message/rfc822',
      rawByteSize: 7,
    })
    await recordCopyrightEmailParse(intake, { status: 'failed', error: 'Malformed MIME' })

    await expect(getPendingCopyrightAgentDispatches()).resolves.not.toContainEqual({
      kind: 'email',
      intakeId: intake.id,
    })
  })

  it('records a moderator rejection once without promoting a public case', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const sesMessageId = `ses-rejected-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 4),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: `claimant-${crypto.randomUUID()}@example.test`,
      subject: 'Copyright complaint',
      bodyText: 'This is a copyright complaint.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    const input = {
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'The extraction agent was unavailable.',
      rationale: 'The message is unrelated spam.',
    }

    const rejected = await rejectCopyrightEmailIntake({
      ...input,
      responseKind: 'needs_information',
      responseMessage: 'Please identify the copyrighted work and each allegedly infringing URL.',
    })
    const duplicate = await rejectCopyrightEmailIntake(input)

    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
      { accepted: false, promoted_copyright_notice_id: null },
    ])
    expect(rejected.responseId).toEqual(expect.any(String))
    expect(duplicate).toEqual({ responseId: null })
    if (!rejected.responseId) throw new Error('Email intake response was not created')
    await expect(
      prepareCopyrightEmailIntakeResponseDelivery(rejected.responseId),
    ).resolves.toMatchObject({
      recipientEmail: expect.stringMatching(/^claimant-/),
      subject: 'More information is needed for your copyright notice',
      text: expect.stringContaining('Please identify the copyrighted work'),
    })
  })

  it('does not let a thread-linked email receive an initial-case decision', async () => {
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const poster = await createTestUser()
    const postId = await insertTestPost({
      title: `Copyright thread ${crypto.randomUUID()}`,
      slug: `copyright-thread-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: null,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: { kind: 'notice', sourceKind: 'email', bodyCiphertext: 'ciphertext' },
      targets: [
        {
          placementKey: `post-image:${postId}:${imageId}`,
          placementRevision: 1,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const sesMessageId = `ses-thread-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 6),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: intake.id,
      noticeId: notice.id,
      linkKind: 'thread',
    })

    await expect(
      rejectCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: null,
        manualFallbackReason: 'The extraction agent was unavailable.',
        rationale: 'This is correspondence, not a new notice.',
      }),
    ).rejects.toThrow('Thread-linked copyright email cannot be rejected as an initial intake')
    await expect(
      promoteCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: null,
        manualFallbackReason: 'The agent recommendation is unavailable.',
        jurisdiction: 'us_dmca',
        claimantDisplayName: null,
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Original photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targets: [
          {
            placementKey: `post-image:${postId}:${imageId}`,
            placementRevision: 1,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
        rationale: 'This must remain correspondence on the matched case.',
      }),
    ).rejects.toThrow('Thread-linked copyright email cannot be approved as an initial intake')
  })
})
