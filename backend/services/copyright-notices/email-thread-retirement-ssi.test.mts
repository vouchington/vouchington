import type { CopyrightOperationalScope } from './operational-retention-cursor.mts'
import { randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createCopyrightOperationalScope,
  createCopyrightRetentionScopes,
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
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function assertMappedSerializationConflict(err: unknown): void {
  expect(err).toMatchObject({
    status: 409,
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
  })
  expect(['40001', '40P01']).toContain((err as { cause?: { code?: string } }).cause?.code)
}

async function assertAbortedRetirementRun(
  noticeId: string,
  intakeId: string,
  previousReferenceCount: number,
  outcome: unknown,
  writerRejected: boolean,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).toBeNull()
  if (writerRejected) assertMappedSerializationConflict(outcome)
  const current = await readCopyrightThreadReferenceState(intakeId)
  const allowedReferenceCounts = writerRejected
    ? [previousReferenceCount, previousReferenceCount + 1]
    : [previousReferenceCount + 1]
  expect(allowedReferenceCounts).toContain(current.referenceCount)
  expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([
    { copyright_notice_id: noticeId, link_kind: 'initial' },
  ])
}

async function assertRetiredWriterRejected(
  noticeId: string,
  intakeId: string,
  writer: Promise<
    | {
        status: 'fulfilled'
        value: Awaited<ReturnType<typeof recordCopyrightEmailThreadReferences>>
      }
    | { status: 'rejected'; error: unknown }
  >,
  input: Parameters<typeof recordCopyrightEmailThreadReferences>[0],
  afterRetirement: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).not.toBeNull()
  const outcome = await writer
  expect(outcome.status).toBe('rejected')
  if (outcome.status === 'rejected') assertMappedSerializationConflict(outcome.error)
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(afterRetirement)
  await expect(recordCopyrightEmailThreadReferences(input)).rejects.toMatchObject({
    status: 409,
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
  })
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(afterRetirement)
}

async function assertAbortedThreadPage(
  noticeId: string,
  intakeId: string,
  references: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
  cursor: Awaited<ReturnType<typeof readCopyrightThreadOperationalCursor>>,
  scope: CopyrightOperationalScope,
): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).toBeNull()
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(references)
  expect(await readCopyrightThreadOperationalCursor(scope)).toEqual(cursor)
}

async function assertCommittedThreadPage(noticeId: string, intakeId: string): Promise<void> {
  expect(await readCopyrightThreadRetirementBound(noticeId)).not.toBeNull()
  expect((await readCopyrightThreadReferenceState(intakeId)).referenceCount).toBe(0)
}

function assertAbortedThreadStats(
  stats: {
    scanned: number
    deleted: number
    hasMore: boolean
  },
  priorProofPages = false,
): void {
  expect(priorProofPages || stats.scanned === 0).toBe(true)
  expect(stats).toMatchObject({ deleted: 0, hasMore: false })
}

function assertCommittedWriterReferenceCount(previousCount: number, currentCount: number): void {
  expect(currentCount).toBe(previousCount + 1)
}

describe('copyright email reference and retirement SSI', () => {
  it.each(['40001', '40P01'])(
    'ends a retention run after a %s abort without advancing its page',
    async code => {
      const notice = await createRetentionMinimalCase()
      const intake = await createRetentionThreadSeedEmail('retention-page-conflict', {
        sesMessageId: notice.initialEmailSesMessageId,
        messageId: `<seed-${randomUUID()}@example.test>`,
      })
      await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
      const scope1 = createCopyrightOperationalScope([notice.noticeId])
      const beforeReferences = await readCopyrightThreadReferenceState(intake.id)
      const beforeCursor = await readCopyrightThreadOperationalCursor(scope1)
      const failure = Object.assign(new Error('retirement serialization conflict'), {
        code,
      })
      let reachedProofPage = false
      const restore = runBeforePostgresStatementForTest(
        '/* readCopyrightThreadBlockerGeneration */',
        async () => {
          reachedProofPage = true
          throw failure
        },
      )
      onTestFinished(restore)
      try {
        const result = await runCopyrightOperationalRetentionCleanup({
          scopes: { ...createCopyrightRetentionScopes(), copyrightCaseThreads: scope1 },
          activeFamilies: ['copyrightCaseThreads'],
          now: new Date(Date.now() + 181 * DAY_MS),
          limits: { batchSize: 10, maxBatches: 1 },
        })
        expect(reachedProofPage).toBe(true)
        expect(result.copyrightCaseThreads).toEqual({ scanned: 0, deleted: 0, hasMore: false })
        await assertAbortedThreadPage(
          notice.noticeId,
          intake.id,
          beforeReferences,
          beforeCursor,
          scope1,
        )
        expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
          { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
        ])
      } finally {
        restore()
      }
    },
  )

  it('rejects a stale reference admission after retirement commits', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionThreadSeedEmail('retirement-first', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: `<seed-${randomUUID()}@example.test>`,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before.referenceCount).toBe(1)
    const scope2 = createCopyrightOperationalScope([notice.noticeId])
    const atInsert = Promise.withResolvers<void>()
    const releaseInsert = Promise.withResolvers<void>()
    const restore = runBeforePostgresStatementForTest(
      '/* insertCopyrightEmailThreadReferences */',
      async () => {
        atInsert.resolve()
        await releaseInsert.promise
      },
    )
    onTestFinished(restore)
    const input = {
      intakeId: intake.id,
      messageId: `<late-${randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    }
    const writer = recordCopyrightEmailThreadReferences(input)
      .then(value => ({ status: 'fulfilled' as const, value }))
      .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
    try {
      await atInsert.promise
      const retired = await sweepCopyrightCaseThreads({
        scope: scope2,
        now: new Date(Date.now() + 181 * DAY_MS),
        replyDays: 180,
        batchSize: 10,
        maxBatches: 100,
      })
      if (retired.deleted === 0) {
        // A concurrent SSI conflict ends this sweep run before the retirement high-water moves.
        releaseInsert.resolve()
        const outcome = await writer
        await assertAbortedRetirementRun(
          notice.noticeId,
          intake.id,
          before.referenceCount,
          outcome.status === 'rejected' ? outcome.error : outcome.value,
          outcome.status === 'rejected',
        )
        return
      }
      const afterRetirement = await readCopyrightThreadReferenceState(intake.id)
      releaseInsert.resolve()
      await assertRetiredWriterRejected(notice.noticeId, intake.id, writer, input, afterRetirement)
    } finally {
      releaseInsert.resolve()
      await writer
      restore()
    }
  })

  it('rolls back a sweep when a new reference commits after its first read', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionThreadSeedEmail('writer-first', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: `<seed-${randomUUID()}@example.test>`,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const scope3 = createCopyrightOperationalScope([notice.noticeId])
    const before = await readCopyrightThreadReferenceState(intake.id)
    let beforeCursor = await readCopyrightThreadOperationalCursor(scope3)
    const atProof = Promise.withResolvers<void>()
    const releaseProof = Promise.withResolvers<void>()
    const restore = runBeforePostgresStatementForTest(
      '/* readCopyrightThreadRetirementAdmission */',
      async () => {
        beforeCursor = await readCopyrightThreadOperationalCursor(scope3)
        atProof.resolve()
        await releaseProof.promise
      },
    )
    onTestFinished(restore)
    const options = {
      scopes: { ...createCopyrightRetentionScopes(), copyrightCaseThreads: scope3 },
      activeFamilies: ['copyrightCaseThreads'] as const,
      now: new Date(Date.now() + 181 * DAY_MS),
      limits: { batchSize: 10, maxBatches: 100 },
    }
    const sweep = runCopyrightOperationalRetentionCleanup(options)
      .then(value => ({ status: 'fulfilled' as const, value }))
      .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
    try {
      await atProof.promise
      const writerInput = {
        intakeId: intake.id,
        messageId: `<fresh-${randomUUID()}@example.test>`,
        inReplyTo: [],
        references: [],
      }
      const writer = await recordCopyrightEmailThreadReferences(writerInput)
        .then(value => ({ status: 'fulfilled' as const, value }))
        .catch((err: unknown) => ({ status: 'rejected' as const, error: err }))
      if (writer.status === 'rejected') assertMappedSerializationConflict(writer.error)
      const afterWriter = await readCopyrightThreadReferenceState(intake.id)
      expect([before.referenceCount, before.referenceCount + 1]).toContain(
        afterWriter.referenceCount,
      )
      if (writer.status === 'fulfilled')
        assertCommittedWriterReferenceCount(before.referenceCount, afterWriter.referenceCount)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([
        { copyright_notice_id: notice.noticeId, link_kind: 'initial' },
      ])
      releaseProof.resolve()
      const firstTick = await sweep
      expect(firstTick.status).toBe('fulfilled')
      if (firstTick.status === 'rejected') throw firstTick.error
      const first = firstTick.value.copyrightCaseThreads!
      if (afterWriter.referenceCount > before.referenceCount) {
        assertAbortedThreadStats(first, true)
        await assertAbortedThreadPage(notice.noticeId, intake.id, afterWriter, beforeCursor, scope3)
      } else if (first.deleted > 0) {
        await assertCommittedThreadPage(notice.noticeId, intake.id)
      } else {
        assertAbortedThreadStats(first, true)
        await assertAbortedThreadPage(notice.noticeId, intake.id, afterWriter, beforeCursor, scope3)
      }
    } finally {
      releaseProof.resolve()
      await sweep
      restore()
    }
  })
})
