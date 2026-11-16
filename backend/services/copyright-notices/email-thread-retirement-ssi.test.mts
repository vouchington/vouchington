import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { describe, expect, it, onTestFinished } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightThreadOperationalCursor,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { runCopyrightOperationalRetentionCleanup } from '../data-retention/cleanup-copyright-operational.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1000

async function assertAbortedThreadPage(
  noticeId: string,
  intakeId: string,
  references: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
  cursor: Awaited<ReturnType<typeof readCopyrightThreadOperationalCursor>>,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).toBeNull()
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(references)
  expect(await readCopyrightThreadOperationalCursor()).toEqual(cursor)
}

describe('copyright email reference and retirement SSI', () => {
  useCopyrightOperationalCursorReservation()

  it.each(['40001', '40P01'])(
    'ends a retention run after a %s abort without advancing its page',
    async code => {
      const notice = await createRetentionMinimalCase()
      const intake = await createRetentionThreadSeedEmail('retention-page-conflict', {
        sesMessageId: notice.initialEmailSesMessageId,
        messageId: `<seed-${randomUUID()}@example.test>`,
      })
      await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
      await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
      const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
      const beforeCursor = await readCopyrightThreadOperationalCursor()
      const failure = Object.assign(new Error('retirement serialization conflict'), {
        code,
      })
      let reachedProofPage = false
      const restore = runBeforePostgresStatementForTest(
        '/* advanceCopyrightThreadLegalProof */',
        async () => {
          reachedProofPage = true
          throw failure
        },
      )
      onTestFinished(restore)
      try {
        const result = await runCopyrightOperationalRetentionCleanup({
          activeFamilies: ['copyrightCaseThreads'],
          now: new Date(Date.now() + 181 * DAY_MS),
          limits: { batchSize: 10, maxBatches: 1 },
        })
        expect(reachedProofPage).toBe(true)
        expect(result.copyrightCaseThreads).toEqual({ scanned: 0, deleted: 0, hasMore: false })
        await assertAbortedThreadPage(notice.noticeId, intake.id, beforeReferences, beforeCursor)
        expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
          { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
        ])
      } finally {
        restore()
      }
    },
  )

  it('rejects a stale first parse and its reference facts after retirement commits', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createUnparsedCopyrightEmailIntake()
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const existing = await createRetentionThreadSeedEmail('retirement-existing-source', {
      messageId: `<existing-${randomUUID()}@example.test>`,
    })
    await linkTestCopyrightEmailIntake(existing.id, notice.noticeId, 'thread', notice.moderator.id)
    expect((await readCopyrightThreadReferenceState(existing.id)).referenceCount).toBe(1)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before).toEqual({ tokenId: null, referenceCount: 0 })
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const atInsert = Promise.withResolvers<void>()
    const releaseInsert = Promise.withResolvers<void>()
    const restore = beforePostgresTransactionQueryForTest(
      '/* insertCopyrightEmailThreadReferences */',
      values => values.includes(intake.id),
      async () => {
        restore()
        atInsert.resolve()
        await releaseInsert.promise
      },
    )
    const input = {
      status: 'succeeded' as const,
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Copyright notice',
      bodyText: 'A first parse racing retirement.',
      messageId: `<late-${randomUUID()}@example.test>`,
      replyReferences: [],
      attachments: [],
    }
    const writer = recordCopyrightEmailParse(intake, input)
    const settled = Promise.allSettled([writer])
    try {
      await Promise.race([
        atInsert.promise,
        writer.then(() => {
          throw new Error('First parse completed before the reference insertion boundary')
        }),
      ])
      await sweepCopyrightCaseThreads({
        now: new Date(Date.now() + 181 * DAY_MS),
        replyDays: 180,
        batchSize: 10,
        maxBatches: 100,
      })
      expect(await readCopyrightThreadRetirementBound(notice.noticeId)).not.toBeNull()
      expect((await readCopyrightThreadReferenceState(existing.id)).referenceCount).toBe(0)
      expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
      releaseInsert.resolve()
      await expect(writer).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      })
      expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({ parseCount: 0 })
      await expect(recordCopyrightEmailParse(intake, input)).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      })
      expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
      expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({ parseCount: 0 })
    } finally {
      releaseInsert.resolve()
      restore()
      await settled
    }
  })

  it('rolls back a sweep when a first parse commits its references after the initial scan', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createUnparsedCopyrightEmailIntake()
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const sweepOptions = {
      now: new Date(Date.now() + 181 * DAY_MS),
      replyDays: 180,
      batchSize: 10,
    }
    // Commit the real bounded proof pages, stopping before the first destructive statement.
    // The raced call below then owns exactly one destructive page, with no earlier page progress.
    const proofComplete = new Error('Owned threading proofs reached the destructive boundary')
    const restorePreparation = beforePostgresTransactionQueryForTest(
      '/* retireCopyrightCaseThread */',
      values => values.includes(notice.noticeId),
      async () => {
        restorePreparation()
        throw proofComplete
      },
    )
    try {
      await expect(sweepCopyrightCaseThreads({ ...sweepOptions, maxBatches: 100 })).rejects.toBe(
        proofComplete,
      )
    } finally {
      restorePreparation()
    }
    const beforeCursor = await readCopyrightThreadOperationalCursor()
    expect(beforeCursor).toMatchObject({ cursor_legal_phase: 'done', cursor_phase: null })
    expect(await readCopyrightThreadRetirementBound(notice.noticeId)).toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual({
      tokenId: null,
      referenceCount: 0,
    })
    expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({ parseCount: 0 })
    const atProof = Promise.withResolvers<void>()
    const releaseProof = Promise.withResolvers<void>()
    // Pause the actual destructive write after its snapshot read the old activity and facts.
    const restore = beforePostgresTransactionQueryForTest(
      '/* retireCopyrightCaseThread */',
      values => values.includes(notice.noticeId),
      async () => {
        restore()
        atProof.resolve()
        await releaseProof.promise
      },
    )
    const sweep = sweepCopyrightCaseThreads({ ...sweepOptions, maxBatches: 1 })
    const settled = Promise.allSettled([sweep])
    try {
      await Promise.race([
        atProof.promise,
        sweep.then(() => {
          throw new Error('Sweep completed before the destructive write boundary')
        }),
      ])
      await expect(
        recordCopyrightEmailParse(intake, {
          status: 'succeeded',
          fromEmail: `claimant-${randomUUID()}@example.test`,
          subject: 'Copyright notice',
          bodyText: 'A first parse before the destructive page.',
          messageId: `<fresh-${randomUUID()}@example.test>`,
          replyReferences: [],
          attachments: [],
        }),
      ).resolves.toBeNull()
      const references = await readCopyrightThreadReferenceState(intake.id)
      expect(references).toMatchObject({ referenceCount: 1, tokenId: expect.any(String) })
      expect(await readCopyrightIntakeRetentionState(intake.id)).toMatchObject({ parseCount: 1 })
      releaseProof.resolve()
      const result = await sweep
      expect(result).toEqual({ scanned: 0, deleted: 0, hasMore: false })
      await assertAbortedThreadPage(notice.noticeId, intake.id, references, beforeCursor)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
        { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
      ])
    } finally {
      releaseProof.resolve()
      restore()
      await settled
    }
  })
})
