import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { describe, expect, it } from 'vitest'
import { installSharedDbScopeObserver } from '../../../test-helpers/vitest-shared-db-scope-observer.mts'
import { lockCopyrightEmailThreadTokens } from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email thread lock order', () => {
  it('waits for the ingestion token lock before locking graph intakes', async () => {
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
    let resolveGraphRead!: () => void
    const graphRead = new Promise<void>(resolve => {
      resolveGraphRead = resolve
    })
    const dispose = installSharedDbScopeObserver(event => {
      if (
        event.operation === 'promoteCopyrightEmailIntakeGraph' &&
        event.scope.kind === 'ids' &&
        event.scope.ids[0] === root.intakeId
      )
        resolveGraphRead()
    })
    try {
      const promotion = promoteCopyrightEmailIntake(
        await copyrightEmailPromotionInput(moderator, root.intakeId),
      )
      await graphRead
      await ingestion.commit()
      await expect(promotion).resolves.toMatchObject({ noticeId: expect.any(String) })
    } finally {
      dispose()
    }
  })
})
