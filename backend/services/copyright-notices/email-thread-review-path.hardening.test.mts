import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import {
  createCommittedCopyrightEmailIntake,
  createCommittedCopyrightEmailRoot,
} from '@voucha/test-helpers/copyright-email-committed-intake'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { parseOrAssertSerializableRollback } from '@voucha/test-helpers/copyright-email-thread-serialization'
import { seedCommittedCopyrightEmailReviewGraph } from '@voucha/test-helpers/copyright-email-review-path-fixtures'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'

describe('copyright email review path', () => {
  it('keeps an existing reply link when a later intake duplicates the parent Message-ID', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { rootMessageId, rootIntakeId, noticeId } = await createCommittedCopyrightEmailRoot(
      moderator.id,
    )
    const reply = await createCommittedCopyrightEmailIntake({ replyReferences: [rootMessageId] })
    await seedCommittedCopyrightEmailReviewGraph({
      intakeId: reply.id,
      ancestorIntakeIds: [rootIntakeId],
      noticeId,
    })
    const duplicate = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(duplicate, {
      status: 'succeeded',
      fromEmail: `claimant-${duplicate.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: rootMessageId,
      replyReferences: [],
      attachments: [],
    })

    expect(outcome).toEqual(
      outcome.conflict ? { conflict: true } : { conflict: false, match: null },
    )
    await expect(readCopyrightEmailAncestorIds(reply.id)).resolves.toEqual([rootIntakeId])
    await expect(getCopyrightStaffEmailIntake(reply.id, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: noticeId },
    })
  })

  it('does not backfill a reply when both parent Message-ID claimants preceded its parse', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const first = await createCommittedCopyrightEmailIntake({ messageId: parentMessageId })
    await createCommittedCopyrightEmailIntake({ messageId: parentMessageId })
    const reply = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(reply, {
      status: 'succeeded',
      fromEmail: `claimant-${reply.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: copyrightEmailMessageId(),
      replyReferences: [parentMessageId],
      attachments: [],
    })
    await promoteCopyrightEmailIntake(await copyrightEmailPromotionInput(moderator, first.id))

    expect(outcome).toEqual(
      outcome.conflict ? { conflict: true } : { conflict: false, match: null },
    )
    await expect(readCopyrightEmailAncestorIds(reply.id)).resolves.toEqual([])
    await expect(getCopyrightStaffEmailIntake(reply.id, moderator)).resolves.toMatchObject({
      linked_notice: null,
      ...(outcome.conflict ? {} : { review_path: 'duplicate_message_id' }),
    })
  })

  it('preserves a resolved waiting edge after a later parent Message-ID claimant is parsed', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const parentMessageId = copyrightEmailMessageId()
    const reply = await createCommittedCopyrightEmailIntake({ replyReferences: [parentMessageId] })
    const first = await createCommittedCopyrightEmailIntake({ messageId: parentMessageId })
    await seedCommittedCopyrightEmailReviewGraph({
      intakeId: reply.id,
      ancestorIntakeIds: [first.id],
    })
    const second = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(second, {
      status: 'succeeded',
      fromEmail: `claimant-${second.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: parentMessageId,
      replyReferences: [],
      attachments: [],
    })
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, first.id),
    )

    expect(outcome).toEqual(
      outcome.conflict ? { conflict: true } : { conflict: false, match: null },
    )
    await expect(readCopyrightEmailAncestorIds(reply.id)).resolves.toEqual([first.id])
    await expect(getCopyrightStaffEmailIntake(reply.id, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: promoted.noticeId },
    })
  })

  it('derives no ancestor for a duplicate Message-ID claimant with a valid References header', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { rootMessageId, rootIntakeId, noticeId } = await createCommittedCopyrightEmailRoot(
      moderator.id,
    )
    const duplicateMessageId = copyrightEmailMessageId()
    await createCommittedCopyrightEmailIntake({ messageId: duplicateMessageId })
    const second = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(second, {
      status: 'succeeded',
      fromEmail: `claimant-${second.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: duplicateMessageId,
      replyReferences: [rootMessageId],
      attachments: [],
    })

    expect(outcome).toEqual(
      outcome.conflict ? { conflict: true } : { conflict: false, match: null },
    )
    await expect(readCopyrightEmailAncestorIds(second.id)).resolves.toEqual([])
    await expect(getCopyrightStaffEmailIntake(second.id, moderator)).resolves.toMatchObject({
      linked_notice: null,
      ...(outcome.conflict ? {} : { review_path: 'duplicate_message_id' }),
    })
    await expect(getCopyrightStaffEmailIntake(rootIntakeId, moderator)).resolves.toMatchObject({
      review_path: 'initial',
      linked_notice: { id: noticeId },
    })
  })

  it('links a reply through References when In-Reply-To names an unknown message', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const { rootMessageId, rootIntakeId, noticeId } = await createCommittedCopyrightEmailRoot(
      moderator.id,
    )
    const reply = await createUnparsedCopyrightEmailIntake()
    const outcome = await parseOrAssertSerializableRollback(reply, {
      status: 'succeeded',
      fromEmail: `claimant-${reply.id}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Threaded copyright email.',
      messageId: copyrightEmailMessageId(),
      inReplyTo: [copyrightEmailMessageId()],
      replyReferences: [rootMessageId],
      attachments: [],
    })

    expect(outcome).toMatchObject(
      outcome.conflict
        ? { conflict: true }
        : {
            conflict: false,
            match: {
              noticeId,
              matchedIntakeId: rootIntakeId,
              matchedReference: rootMessageId.slice(1, -1),
            },
          },
    )
    await expect(readCopyrightEmailAncestorIds(reply.id)).resolves.toEqual(
      outcome.conflict ? [] : [rootIntakeId],
    )
    const retained = await getCopyrightStaffEmailIntake(reply.id, moderator)
    expect(retained).toMatchObject({
      linked_notice: outcome.conflict ? null : { id: noticeId },
    })
    expect(outcome.conflict ? ['initial', 'unresolved_thread'] : ['matched_thread']).toContain(
      retained?.review_path,
    )
    await expect(getCopyrightStaffEmailIntake(rootIntakeId, moderator)).resolves.toMatchObject({
      review_path: 'initial',
      linked_notice: { id: noticeId },
    })
  })
})
