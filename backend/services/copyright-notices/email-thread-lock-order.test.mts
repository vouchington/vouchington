import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email thread lock order', () => {
  it('promotes while a separate ingestion owns the token lock', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const messageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId, replyReferences: [] })
    const rows = buildCopyrightEmailThreadReferenceRows({
      messageId,
      inReplyTo: [],
      references: [],
    })
    const digest = rows[0]!.lookup_digest

    await using ingestion = await beginTransaction()
    await lockCopyrightEmailThreadTokens(ingestion, [digest])
    const promoted = await promoteCopyrightEmailIntake(
      await copyrightEmailPromotionInput(moderator, root.intakeId),
    )
    expect(promoted.noticeId).toEqual(expect.any(String))
    await ingestion.commit()
  })
})
