import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  admitCopyrightEmailCorrespondence,
  createCopyrightEmailIntake,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  prepareCopyrightEmailDelivery,
  recordCopyrightEmailParse,
  reviewCopyrightAppeal,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'

describe('email appeal review', () => {
  it('emails the unmatched submitter the appeal outcome', async () => {
    const [poster, claimant, moderatorRecord] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `email appeal ${crypto.randomUUID()}`,
      slug: `email-appeal-${crypto.randomUUID()}`,
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
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Claimed photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })
    await appendCopyrightFormScreening({
      intakeId: intake.intake.id,
      inputSha256: Buffer.alloc(32, 12),
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam or invalidity.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    await applyNonSpamSignedInCopyrightFormScreening(intake.intake.copyright_notice_submission_id)
    const noticeId = intake.intake.copyright_notice_id
    const targetId = await readCopyrightNoticeTargetId(noticeId)
    const restriction = (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]
    if (!restriction) throw new Error('fixture restriction missing')
    const sesMessageId = `ses-appeal-${crypto.randomUUID()}`
    const { intake: emailIntake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 13),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
    })
    await recordCopyrightEmailParse(emailIntake, {
      status: 'succeeded',
      fromEmail: 'poster@example.test',
      subject: 'Appeal',
      bodyText: 'I created this image.',
      messageId: `<${crypto.randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    })
    await linkCopyrightEmailIntakeToNotice({
      intakeId: emailIntake.id,
      noticeId,
      linkKind: 'thread',
    })
    const admitted = await admitCopyrightEmailCorrespondence({
      currentUser: moderator,
      intakeId: emailIntake.id,
      kind: 'appeal',
      targetIds: [targetId],
      structuredSubmission: { reason: 'I created this image.', targetIds: [targetId] },
      rationale: 'The email completes an appeal of the restricted material.',
      recommendationId: null,
      manualFallbackReason: 'Agent output is unavailable.',
    })
    await reviewCopyrightAppeal({
      submissionId: admitted.submissionId,
      currentUser: moderator,
      recommendationId: null,
      manualFallbackReason: 'The record is sufficient without an agent recommendation.',
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: restriction.id, action: 'reverse' }],
    })
    const reviewed = await getCopyrightNoticePrivateAggregate(noticeId)
    const outcomeIntent = reviewed?.deliveryIntents.find(
      intent =>
        intent.copyright_notice_submission_id === admitted.submissionId &&
        intent.delivery_kind === 'status_update' &&
        intent.channel === 'email',
    )
    if (!outcomeIntent) throw new Error('Email appeal outcome was not queued')
    await expect(prepareCopyrightEmailDelivery(outcomeIntent.id)).resolves.toMatchObject({
      recipientEmail: 'poster@example.test',
      text: 'Your appeal has been reviewed. See the copyright case for the recorded outcome.',
    })
  })
})
