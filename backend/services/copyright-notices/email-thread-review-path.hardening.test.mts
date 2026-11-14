import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { createCommittedCopyrightEmailRoot } from '@voucha/test-helpers/copyright-email-committed-intake'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { parseOrAssertSerializableRollback } from '@voucha/test-helpers/copyright-email-thread-serialization'
import { copyrightEmailMessageId } from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'

describe('copyright email review path', () => {
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
