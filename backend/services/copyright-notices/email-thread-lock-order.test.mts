import { beginTransaction } from '@voucha/test-helpers'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { lockTestCopyrightEmailIntakeForPromotion } from '@voucha/test-helpers/copyright-thread-lock-order'
import { describe, expect, it } from 'vitest'
import {
  insertCopyrightEmailThreadReferences,
  lockCopyrightEmailThreadTokens,
} from './email-thread-ancestors.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

describe('copyright email thread lock order', () => {
  it('allows token-first ingestion to insert its FK while promotion waits on the same token', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()
    const rows = buildCopyrightEmailThreadReferenceRows({
      messageId: `<${crypto.randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    })
    const digest = rows[0]!.lookup_digest

    await using ingestion = await beginTransaction()
    await lockCopyrightEmailThreadTokens(ingestion, [digest])
    await using promotion = await beginTransaction()
    await lockTestCopyrightEmailIntakeForPromotion(intake.id, promotion)
    const promotionWaiting = lockCopyrightEmailThreadTokens(promotion, [digest])

    const tokenIds = await insertCopyrightEmailThreadReferences(ingestion, intake.id, rows)
    expect(tokenIds.has(digest)).toBe(true)
    await ingestion.commit()
    await promotionWaiting
    await promotion.rollback()
  })
})
