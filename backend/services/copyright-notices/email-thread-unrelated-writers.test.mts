import { randomUUID } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import {
  createCommittedCopyrightEmailIntake,
  createCommittedCopyrightEmailRoot,
} from '@voucha/test-helpers/copyright-email-committed-intake'
import { withCopyrightEmailErasureTransaction } from '@voucha/test-helpers/copyright-email-erasure-transaction'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  commitCopyrightEmailReceiptErasureMarker,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { describe, expect, it } from 'vitest'
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { eraseIntakePage } from './operational-retention-email-intake-page.mts'

describe('unrelated copyright email writers', () => {
  const bucket = useCopyrightEvidenceBucket()

  it('commits distinct reference admission, reply derivation and source erasure', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const root = await createCommittedCopyrightEmailRoot(moderator.id)
    const replyMessageId = `<${randomUUID()}@example.test>`
    const reply = await createCommittedCopyrightEmailIntake({
      messageId: replyMessageId,
      replyReferences: [root.rootMessageId],
    })
    const admission = await createUnparsedCopyrightEmailIntake()
    const erased = await createCommittedCopyrightEmailIntake()
    await bucket.put(erased.raw_storage_key, { versions: 2 })
    await commitCopyrightEmailReceiptErasureMarker(erased.id)
    const replyInput = {
      intakeId: reply.id,
      messageId: replyMessageId,
      inReplyTo: [],
      references: [root.rootMessageId],
    }
    const admissionInput = {
      status: 'succeeded' as const,
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'Independent reference facts.',
      attachments: [],
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [],
      replyReferences: [],
    }
    let interleaved = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* insertCopyrightEmailThreadReferences */',
      values => values.includes(admission.id),
      async () => {
        // Admission has read links; derivation now reads references and writes its own link.
        // Restore before opening another transaction, keeping the paused transaction wrapped.
        restore()
        interleaved = true
        const derivation = deriveCopyrightEmailThread(
          replyInput,
          buildCopyrightEmailThreadReferenceRows(replyInput),
        )
        const erasure = withCopyrightEmailErasureTransaction(transaction =>
          eraseIntakePage(transaction, erased.id, new Date(), 20, {
            phase: null,
            edgeId: null,
          }),
        )
        const outcomes = await Promise.allSettled([derivation, erasure])
        expect(outcomes).toEqual([
          {
            status: 'fulfilled',
            value: {
              noticeId: root.noticeId,
              matchedIntakeId: root.rootIntakeId,
              matchedReference: root.rootMessageId.slice(1, -1),
            },
          },
          { status: 'fulfilled', value: { complete: true, erased: true } },
        ])
      },
    )
    try {
      await expect(recordCopyrightEmailParse(admission, admissionInput)).resolves.toBeNull()
    } finally {
      restore()
    }
    expect(interleaved).toBe(true)
    expect(await readCopyrightThreadReferenceState(admission.id)).toMatchObject({
      referenceCount: 1,
      tokenId: expect.any(String),
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([
      { copyright_notice_id: root.noticeId, link_kind: 'thread' },
    ])
    expect(await readCopyrightIntakeRetentionState(erased.id)).toMatchObject({
      intakeExists: false,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 0,
    })
    expect(await bucket.countVersions(erased.raw_storage_key)).toBe(0)
  })
})
