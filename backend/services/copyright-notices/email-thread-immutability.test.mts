import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { insertCopyrightThreadReferenceWithoutToken } from '@voucha/test-helpers/copyright-thread-retention'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { getCopyrightStaffEmailIntake } from './read-models.mts'

describe('immutable copyright email ancestor edges', () => {
  it('rejects a null token reference outside retention erasure', async () => {
    const intake = await recordThreadedCopyrightEmail({ messageId: null, replyReferences: [] })
    await expect(insertCopyrightThreadReferenceWithoutToken(intake.intakeId)).rejects.toMatchObject(
      {
        code: 'P0001',
      },
    )
  })

  it('preserves a waiting reply edge when its own Message-ID is later claimed twice', async () => {
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
    await expect(readCopyrightEmailAncestorIds(reply.intakeId)).resolves.toEqual([parent.intakeId])
    await recordThreadedCopyrightEmail({ messageId: replyMessageId, replyReferences: [] })
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, parent.intakeId),
    )

    expect(reply.match).toBeNull()
    await expect(getCopyrightStaffEmailIntake(reply.intakeId, moderator)).resolves.toMatchObject({
      review_path: 'matched_thread',
      linked_notice: { id: promoted.noticeId },
    })
  })
})
