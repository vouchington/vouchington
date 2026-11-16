import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
  seedTestCopyrightAncestorEdge,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  readCopyrightThreadRetirementBound,
  seedCopyrightThreadRetirement,
} from '@voucha/test-helpers/copyright-thread-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { describe, expect, it, onTestFinished } from 'vitest'
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

describe('copyright retired ancestor routing at link insertion', () => {
  it('rejects a fresh reply when its authorizing ancestor retires after the last graph check', async () => {
    const notice = await createRetentionMinimalCase()
    const parentMessageId = `<parent-${randomUUID()}@example.test>`
    const parent = await createRetentionThreadSeedEmail('routing-retirement-parent', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: parentMessageId,
    })
    await linkTestCopyrightEmailIntake(parent.id, notice.noticeId)
    const replyMessageId = `<reply-${randomUUID()}@example.test>`
    const reply = await createRetentionThreadSeedEmail('routing-retirement-reply', {
      messageId: replyMessageId,
      replyReferences: [parentMessageId],
    })
    expect(parent.id.localeCompare(reply.id)).toBeLessThan(0)
    await seedTestCopyrightAncestorEdge(reply.id, parent.id)
    const parentFacts = await readCopyrightThreadReferenceState(parent.id)
    const replyFacts = await readCopyrightThreadReferenceState(reply.id)
    expect(parentFacts.referenceCount).toBe(1)
    expect(await readCopyrightEmailAncestorIds(reply.id)).toEqual([parent.id])
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([])
    const input = {
      intakeId: reply.id,
      messageId: replyMessageId,
      inReplyTo: [parentMessageId],
      references: [],
    }
    let retirementCommitted = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* linkCopyrightEmailIntakeToNotice */',
      values => values.includes(reply.id),
      async () => {
        // Derivation has passed every read gate. Retire only the older ancestor, so the
        // reply's own bound check still passes and the actual link write must revalidate it.
        restore()
        await seedCopyrightThreadRetirement(notice.noticeId, reply.id)
        retirementCommitted = true
      },
    )
    onTestFinished(restore)
    try {
      await expect(
        deriveCopyrightEmailThread(input, buildCopyrightEmailThreadReferenceRows(input)),
      ).rejects.toMatchObject({ status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED })
      expect(retirementCommitted).toBe(true)
      expect(await readCopyrightThreadRetirementBound(notice.noticeId)).toBe(reply.id)
      expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([])
      expect(await readCopyrightEmailIntakeNoticeLinks(parent.id)).toEqual([
        { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
      ])
      expect(await readCopyrightThreadReferenceState(parent.id)).toEqual(parentFacts)
      expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(replyFacts)
      expect(await readCopyrightEmailAncestorIds(reply.id)).toEqual([parent.id])
    } finally {
      restore()
    }
  })
})
