import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { createCommittedCopyrightEmailRoot } from '@voucha/test-helpers/copyright-email-committed-intake'
import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  readCopyrightEmailReceiptErasedAt,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('copyright email reference admission and graph derivation', () => {
  useCopyrightOperationalCursorReservation()

  it('rolls back the first parse when erasure commits after its live-source preflight', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    let erased = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* recordCopyrightEmailParse */',
      values => values.includes(intake.id),
      async () => {
        restore()
        await expect(
          sweepUnlinkedCopyrightEmailIntakes({
            now: new Date(Date.now() + 91 * DAY_MS),
            retentionDays: 90,
            childLimit: 20,
            maxBatches: 1,
          }),
        ).resolves.toEqual({ scanned: 1, erased: 1, hasMore: true })
        erased = true
      },
    )
    try {
      await expect(
        recordCopyrightEmailParse(intake, {
          status: 'succeeded',
          fromEmail: `claimant-${randomUUID()}@example.test`,
          subject: 'Copyright notice',
          bodyText: 'First immutable parse.',
          messageId: `<${randomUUID()}@example.test>`,
          replyReferences: [],
          attachments: [],
        }),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'copyright email intake is under retention erasure',
      })
    } finally {
      restore()
    }
    expect(erased).toBe(true)
    expect(await readCopyrightEmailReceiptErasedAt(intake.id)).not.toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual({
      tokenId: null,
      referenceCount: 0,
    })
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      parseCount: 0,
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
  })

  it.each(['40001', '40P01'])(
    'maps an admission %s conflict to 409 and rolls back the first parse and its facts',
    async code => {
      const intake = await createUnparsedCopyrightEmailIntake()
      const before = await readCopyrightIntakeRetentionState(intake.id)
      const failure = Object.assign(new Error('reference admission serialization conflict'), {
        code,
      })
      let reachedInsert = false
      const restore = beforePostgresTransactionQueryForTest(
        '/* insertCopyrightEmailThreadReferences */',
        values => values.includes(intake.id),
        async () => {
          reachedInsert = true
          throw failure
        },
      )
      try {
        await expect(
          recordCopyrightEmailParse(intake, {
            status: 'succeeded',
            fromEmail: `claimant-${randomUUID()}@example.test`,
            subject: 'Copyright notice',
            bodyText: 'Atomic parse and references.',
            messageId: `<${randomUUID()}@example.test>`,
            replyReferences: [],
            attachments: [],
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          cause: failure,
        })
      } finally {
        restore()
      }
      expect(reachedInsert).toBe(true)
      expect(await readCopyrightThreadReferenceState(intake.id)).toEqual({
        tokenId: null,
        referenceCount: 0,
      })
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(before)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toBeNull()
    },
  )

  it('recovers derivation on parse replay without rewriting the committed reference facts', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const root = await createCommittedCopyrightEmailRoot(moderator.id)
    const reply = await createUnparsedCopyrightEmailIntake()
    const input = {
      status: 'succeeded' as const,
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Copyright reply',
      bodyText: 'Immutable parsed reply.',
      messageId: `<${randomUUID()}@example.test>`,
      replyReferences: [root.rootMessageId],
      attachments: [],
    }
    const failure = new Error('Interrupted after facts committed')
    let reachedDerivation = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* recordCopyrightEmailThreadReferences:currentTokens */',
      values => values.includes(reply.id),
      async () => {
        reachedDerivation = true
        throw failure
      },
    )
    try {
      await expect(recordCopyrightEmailParse(reply, input)).rejects.toBe(failure)
    } finally {
      restore()
    }
    expect(reachedDerivation).toBe(true)
    const before = await readCopyrightThreadReferenceState(reply.id)
    expect(before).toMatchObject({ referenceCount: 2, tokenId: expect.any(String) })
    expect(await readCopyrightIntakeRetentionState(reply.id)).toMatchObject({ parseCount: 1 })
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([])
    await expect(recordCopyrightEmailParse(reply, input)).resolves.toMatchObject({
      noticeId: root.noticeId,
      matchedIntakeId: root.rootIntakeId,
    })
    const linked = await readCopyrightEmailIntakeNoticeLinks(reply.id)
    expect(linked).toEqual([{ copyright_notice_id: root.noticeId, link_kind: 'thread' }])
    await expect(recordCopyrightEmailParse(reply, input)).resolves.toMatchObject({
      noticeId: root.noticeId,
      matchedIntakeId: root.rootIntakeId,
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual(linked)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    expect(await readCopyrightIntakeRetentionState(reply.id)).toMatchObject({
      parseCount: 1,
      ancestorCount: 1,
    })
  })
})
