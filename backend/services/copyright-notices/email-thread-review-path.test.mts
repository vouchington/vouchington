import {
  approveCommittedCopyrightEmailRoot,
  createCommittedCopyrightEmailIntake,
  createCommittedCopyrightEmailRoot,
  createCommittedWaitingCopyrightEmailThread,
} from '@voucha/test-helpers/copyright-email-committed-intake'
import { seedCommittedCopyrightEmailReviewGraph } from '@voucha/test-helpers/copyright-email-review-path-fixtures'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { parseOrAssertSerializableRollback } from '@voucha/test-helpers/copyright-email-thread-serialization'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email review path', () => {
  it('classifies a reply after a duplicated Message-ID as manual review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    await createCommittedCopyrightEmailRoot(moderator.id, parentMessageId)
    await createCommittedCopyrightEmailIntake({ messageId: parentMessageId })
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: copyrightEmailMessageId(),
      replyReferences: [parentMessageId],
    })

    await expect(
      expectManualReview(moderator, reply.id, 'duplicate_message_id'),
    ).resolves.toMatchObject({
      review_path: 'duplicate_message_id',
    })
  })

  it('classifies the second Message-ID claimant as manual review', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    await createCommittedCopyrightEmailRoot(moderator.id, parentMessageId)
    const second = await createCommittedCopyrightEmailIntake({
      messageId: parentMessageId,
      replyReferences: [],
    })

    await expect(
      expectManualReview(moderator, second.id, 'duplicate_message_id'),
    ).resolves.toMatchObject({
      review_path: 'duplicate_message_id',
    })
  })

  it('links a waiting reply through the root References edge before the intermediate arrives', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { rootMessageId, intermediateMessageId, rootIntakeId, replyIntakeId, noticeId } =
      await createCommittedWaitingCopyrightEmailThread(moderator.id)

    await expect(getCopyrightStaffEmailIntake(replyIntakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: noticeId },
    })
    const existingAncestors = await readCopyrightEmailAncestorIds(replyIntakeId)
    const intermediate = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(intermediate, {
      status: 'succeeded',
      fromEmail: `claimant-${intermediate.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: intermediateMessageId,
      replyReferences: [rootMessageId],
      attachments: [],
    })

    await expect(getCopyrightStaffEmailIntake(replyIntakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: noticeId },
    })
    expect(outcome).toMatchObject(
      outcome.conflict ? { conflict: true } : { conflict: false, match: { noticeId: noticeId } },
    )
    await expect(readCopyrightEmailAncestorIds(intermediate.id)).resolves.toEqual(
      outcome.conflict ? [] : [rootIntakeId],
    )
    await expect(readCopyrightEmailAncestorIds(replyIntakeId)).resolves.toEqual(
      outcome.conflict ? existingAncestors : [rootIntakeId, intermediate.id].toSorted(),
    )
    const retained = await getCopyrightStaffEmailIntake(intermediate.id, moderator)
    expect(retained).toMatchObject({
      linked_notice: outcome.conflict ? null : { id: noticeId },
    })
    expect(outcome.conflict ? ['initial', 'unresolved_thread'] : ['matched_thread']).toContain(
      retained?.review_path,
    )
  })

  it('reports an unlinked conflict after both parent intakes are approved', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [firstMessageId],
      replyReferences: [secondMessageId],
    })
    const firstParent = await createCommittedCopyrightEmailIntake({
      messageId: firstMessageId,
      replyReferences: [],
    })
    const secondParent = await createCommittedCopyrightEmailIntake({
      messageId: secondMessageId,
      replyReferences: [],
    })
    await seedCommittedCopyrightEmailReviewGraph({
      intakeId: reply.id,
      ancestorIntakeIds: [firstParent.id, secondParent.id],
    })
    await approveCommittedCopyrightEmailRoot(firstParent, moderator.id)
    await expect(getCopyrightStaffEmailIntake(reply.id, moderator)).resolves.toMatchObject({
      linked_notice: null,
    })
    await approveCommittedCopyrightEmailRoot(secondParent, moderator.id)

    await expectManualReview(moderator, reply.id, 'ancestor_notice_conflict')
  })

  it('reports duplicate_message_id when the same intake is also in ancestor conflict', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstMessageId = copyrightEmailMessageId()
    const secondMessageId = copyrightEmailMessageId()
    const ownMessageId = copyrightEmailMessageId()
    const firstRoot = await createCommittedCopyrightEmailRoot(moderator.id, firstMessageId)
    const secondRoot = await createCommittedCopyrightEmailRoot(moderator.id, secondMessageId)
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: ownMessageId,
      inReplyTo: [firstMessageId],
      replyReferences: [secondMessageId],
    })
    await seedCommittedCopyrightEmailReviewGraph({
      intakeId: reply.id,
      ancestorIntakeIds: [firstRoot.rootIntakeId, secondRoot.rootIntakeId],
    })
    await expect(
      expectManualReview(moderator, reply.id, 'ancestor_notice_conflict'),
    ).resolves.toMatchObject({
      review_path: 'ancestor_notice_conflict',
    })
    await createCommittedCopyrightEmailIntake({ messageId: ownMessageId })

    await expectManualReview(moderator, reply.id, 'duplicate_message_id')
  })

  it('leaves a reply unlinked while a known ancestor has no case', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const linkedMessageId = copyrightEmailMessageId()
    const waitingMessageId = copyrightEmailMessageId()
    const linked = await createCommittedCopyrightEmailRoot(moderator.id, linkedMessageId)
    const waiting = await createCommittedCopyrightEmailIntake({ messageId: waitingMessageId })
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [linkedMessageId],
      replyReferences: [waitingMessageId],
    })
    await seedCommittedCopyrightEmailReviewGraph({
      intakeId: reply.id,
      ancestorIntakeIds: [linked.rootIntakeId, waiting.id],
    })

    await expect(
      expectManualReview(moderator, reply.id, 'unresolved_thread'),
    ).resolves.toMatchObject({
      review_path: 'unresolved_thread',
    })
  })

  it('keeps a reply in manual review when a referenced Message-ID is duplicated', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const ambiguousMessageId = copyrightEmailMessageId()
    const parent = await createCommittedCopyrightEmailIntake({
      messageId: parentMessageId,
      replyReferences: [],
    })
    await createCommittedCopyrightEmailIntake({ messageId: ambiguousMessageId })
    await createCommittedCopyrightEmailIntake({ messageId: ambiguousMessageId })
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: copyrightEmailMessageId(),
      inReplyTo: [parentMessageId],
      replyReferences: [ambiguousMessageId],
    })

    await expect(
      expectManualReview(moderator, reply.id, 'duplicate_message_id'),
    ).resolves.toMatchObject({
      review_path: 'duplicate_message_id',
    })
    await approveCommittedCopyrightEmailRoot(parent, moderator.id)
    await expectManualReview(moderator, reply.id, 'duplicate_message_id')
  })
})

async function expectManualReview(
  moderator: Awaited<ReturnType<typeof createTestUser>>,
  intakeId: string,
  reviewPath: 'duplicate_message_id' | 'ancestor_notice_conflict' | 'unresolved_thread',
) {
  const queued = await searchCopyrightStaffEmailIntakes(moderator, {
    limit: 5,
    intakeIds: [intakeId],
  })
  expect(queued.intakes).toEqual([
    expect.objectContaining({ id: intakeId, review_path: reviewPath, linked_notice_id: null }),
  ])
  const retained = await getCopyrightStaffEmailIntake(intakeId, moderator)
  expect(retained).toMatchObject({ review_path: reviewPath, linked_notice: null })
  return retained
}
