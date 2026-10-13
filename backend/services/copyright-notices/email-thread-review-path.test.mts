import { createTestUser } from '@voucha/test-helpers'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  promoteInitialCopyrightEmail,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { getCopyrightStaffEmailIntake } from './read-models.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email review path', () => {
  it('leaves a linked reply in place when a later intake duplicates the parent Message-ID', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const parent = await promoteInitialCopyrightEmail({ moderator, messageId: parentMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [parentMessageId],
    })
    await recordThreadedCopyrightEmail({ messageId: parentMessageId, replyReferences: [] })

    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: parent.noticeId },
    })
  })

  it('sends a reply that arrives after a duplicated Message-ID to manual review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    await promoteInitialCopyrightEmail({ moderator, messageId: parentMessageId })
    await recordThreadedCopyrightEmail({ messageId: parentMessageId, replyReferences: [] })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [parentMessageId],
    })

    expect(reply.match).toBeNull()
    await expectManualReview(moderator, reply.intakeId, 'duplicate_message_id')
  })

  it('does not link a waiting reply after its parent Message-ID is claimed twice', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      replyReferences: [parentMessageId],
    })
    const firstParent = await recordThreadedCopyrightEmail({
      messageId: parentMessageId,
      replyReferences: [],
    })
    await recordThreadedCopyrightEmail({ messageId: parentMessageId, replyReferences: [] })
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, firstParent.intakeId),
    )

    expect(promoted.noticeId).toEqual(expect.any(String))
    await expectManualReview(moderator, reply.intakeId, 'duplicate_message_id')
  })

  it('does not link a waiting reply after its own Message-ID is claimed twice', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const replyMessageId = copyrightEmailMessageId()
    const parent = await recordThreadedCopyrightEmail({
      messageId: parentMessageId,
      replyReferences: [],
    })
    const reply = await recordThreadedCopyrightEmail({
      messageId: replyMessageId,
      replyReferences: [parentMessageId],
    })
    await recordThreadedCopyrightEmail({ messageId: replyMessageId, replyReferences: [] })
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, parent.intakeId),
    )

    expect(promoted.noticeId).toEqual(expect.any(String))
    expect(reply.match).toBeNull()
    await expectManualReview(moderator, reply.intakeId, 'duplicate_message_id')
  })

  it('sends the second Message-ID claimant to manual review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    await promoteInitialCopyrightEmail({ moderator, messageId: parentMessageId })
    const second = await recordThreadedCopyrightEmail({
      messageId: parentMessageId,
      replyReferences: [],
    })

    expect(second.match).toBeNull()
    await expectManualReview(moderator, second.intakeId, 'duplicate_message_id')
  })

  it('links a reply through References when In-Reply-To names an unknown message', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const root = await promoteInitialCopyrightEmail({ moderator, messageId: rootMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [copyrightEmailMessageId()],
      replyReferences: [rootMessageId],
    })

    expect(reply.match).toMatchObject({ noticeId: root.noticeId })
    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: root.noticeId },
    })
  })

  it('links a waiting reply through the root References edge before the intermediate arrives', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const intermediateMessageId = copyrightEmailMessageId()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [intermediateMessageId],
      replyReferences: [rootMessageId],
    })
    const root = await recordThreadedCopyrightEmail({
      messageId: rootMessageId,
      replyReferences: [],
    })
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, root.intakeId),
    )

    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: promoted.noticeId },
    })
    await expect(
      recordThreadedCopyrightEmail({
        messageId: intermediateMessageId,
        replyReferences: [rootMessageId],
      }),
    ).resolves.toMatchObject({ match: expect.objectContaining({ noticeId: promoted.noticeId }) })
  })

  it('sends a reply whose ancestors are on two cases to manual review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    await promoteInitialCopyrightEmail({ moderator, messageId: firstMessageId })
    await promoteInitialCopyrightEmail({ moderator, messageId: secondMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [firstMessageId],
      replyReferences: [secondMessageId],
    })

    expect(reply.match).toBeNull()
    await expectManualReview(moderator, reply.intakeId, 'ancestor_notice_conflict')
  })

  it('keeps that conflict unlinked when both parents are promoted after the reply', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const reply = await recordThreadedCopyrightEmail({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [firstMessageId],
      replyReferences: [secondMessageId],
    })
    const firstParent = await recordThreadedCopyrightEmail({
      messageId: firstMessageId,
      replyReferences: [],
    })
    const secondParent = await recordThreadedCopyrightEmail({
      messageId: secondMessageId,
      replyReferences: [],
    })
    await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, firstParent.intakeId),
    )
    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      linked_notice: null,
    })
    await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, secondParent.intakeId),
    )

    await expectManualReview(moderator, reply.intakeId, 'ancestor_notice_conflict')
  })

  it('reports duplicate_message_id when the same intake is also in ancestor conflict', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const ownMessageId = copyrightEmailMessageId()
    await promoteInitialCopyrightEmail({ moderator, messageId: firstMessageId })
    await promoteInitialCopyrightEmail({ moderator, messageId: secondMessageId })
    const reply = await recordThreadedCopyrightEmail({
      messageId: ownMessageId,
      inReplyTo: [firstMessageId],
      replyReferences: [secondMessageId],
    })
    expect(reply.match).toBeNull()
    await expectManualReview(moderator, reply.intakeId, 'ancestor_notice_conflict')
    await recordThreadedCopyrightEmail({ messageId: ownMessageId, replyReferences: [] })

    await expectManualReview(moderator, reply.intakeId, 'duplicate_message_id')
  })
})

async function expectManualReview(
  moderator: Awaited<ReturnType<typeof createTestUser>>,
  intakeId: string,
  reviewPath: 'duplicate_message_id' | 'ancestor_notice_conflict',
) {
  const queued = await searchCopyrightStaffEmailIntakes(moderator, {
    limit: 5,
    intakeIds: [intakeId],
  })
  expect(queued.intakes).toEqual([
    expect.objectContaining({ id: intakeId, review_path: reviewPath, linked_notice_id: null }),
  ])
  await expect(getCopyrightStaffEmailIntake(intakeId, moderator)).resolves.toMatchObject({
    review_path: reviewPath,
    linked_notice: null,
  })
}
