import { randomBytes, randomUUID } from 'node:crypto'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { readCopyrightUnlinkedEmailOperationalCursor } from '@voucha/test-helpers/copyright-unlinked-email-cursor'
import {
  readCopyrightEmailReceiptErasedAt,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionThreadSeedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'
import { admitCopyrightEmailReferenceFacts } from './email-thread-reference-facts.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'

const DAY_MS = 24 * 60 * 60 * 1000

async function assertFirstReplayRolledBack(
  err: unknown,
  intakeId: string,
  before: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
  beforeRetention: Awaited<ReturnType<typeof readCopyrightIntakeRetentionState>>,
): Promise<void> {
  expect(err).toMatchObject({
    status: 409,
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
    cause: { code: '40001' },
  })
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(before)
  expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual([])
  expect(await readCopyrightIntakeRetentionState(intakeId)).toEqual(beforeRetention)
}

async function assertSecondReplayRolledBack(
  err: unknown,
  intakeId: string,
  before: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
  links: Awaited<ReturnType<typeof readCopyrightEmailIntakeNoticeLinks>>,
  expectedAncestorCount: number,
): Promise<void> {
  expect(err).toMatchObject({
    status: 409,
    code: COPYRIGHT_EMAIL_THREAD_CHANGED,
    cause: { code: '40001' },
  })
  expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual(links)
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(before)
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBe(
    expectedAncestorCount,
  )
}

describe('copyright email reference admission and graph derivation', () => {
  it('declines reference admission when erasure commits after its preflight', async () => {
    const sesMessageId = `ses-phase-erasure-preflight-${randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: randomBytes(32),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const scope1 = createCopyrightOperationalScope([intake.id])
    const cursorBefore = await readCopyrightUnlinkedEmailOperationalCursor(scope1)
    const atTokenInsert = Promise.withResolvers<void>()
    const releaseTokenInsert = Promise.withResolvers<void>()
    const restore = runBeforePostgresStatementForTest(
      '/* resolveCopyrightEmailThreadTokenIds:insert */',
      async () => {
        atTokenInsert.resolve()
        await releaseTokenInsert.promise
      },
    )
    onTestFinished(restore)
    const rows = buildCopyrightEmailThreadReferenceRows({
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [],
      references: [],
    })
    const admission = Promise.allSettled([admitCopyrightEmailReferenceFacts(intake.id, rows)])
    try {
      await atTokenInsert.promise
      const erased = await sweepUnlinkedCopyrightEmailIntakes({
        scope: scope1,
        now: new Date(Date.now() + 91 * DAY_MS),
        retentionDays: 90,
        childLimit: 20,
        maxBatches: 1,
      })
      releaseTokenInsert.resolve()
      const [outcome] = await admission
      const rejection =
        outcome.status === 'rejected' && outcome.reason instanceof Error
          ? (outcome.reason as Error & {
              status?: number
              code?: string
              cause?: { code?: string }
            })
          : null
      expect([
        {
          erasure: { scanned: 1, erased: 1, hasMore: true },
          admission: false,
          error: null,
          erased: true,
          references: 0,
        },
        {
          erasure: { scanned: 1, erased: 1, hasMore: true },
          admission: null,
          error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40001' },
          erased: true,
          references: 0,
        },
        {
          erasure: { scanned: 0, erased: 0, hasMore: false },
          admission: true,
          error: null,
          erased: false,
          references: rows.length,
        },
        {
          erasure: { scanned: 0, erased: 0, hasMore: false },
          admission: null,
          error: { status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED, causeCode: '40001' },
          erased: false,
          references: 0,
        },
      ]).toContainEqual({
        erasure: erased,
        admission: outcome.status === 'fulfilled' ? outcome.value : null,
        error: rejection
          ? { status: rejection.status, code: rejection.code, causeCode: rejection.cause?.code }
          : null,
        erased: (await readCopyrightEmailReceiptErasedAt(intake.id)) !== null,
        references: (await readCopyrightThreadReferenceState(intake.id)).referenceCount,
      })
      expect((await readCopyrightIntakeRetentionState(intake.id)).receiptExists).toBe(true)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
      // A committed marker can leave the child cursor in progress; an SSI loser cannot move it.
      const cursorAfter = await readCopyrightUnlinkedEmailOperationalCursor(scope1)
      expect(erased.erased === 0 ? cursorAfter : cursorBefore).toEqual(cursorBefore)
    } finally {
      releaseTokenInsert.resolve()
      await admission
      restore()
    }
  })

  it.each(['40001', '40P01'])(
    'maps an admission %s conflict to 409 and rolls back reference facts',
    async code => {
      const intake = await createRetentionThreadSeedEmail('phase-admission-conflict', {
        messageId: `<seed-${randomUUID()}@example.test>`,
      })
      const before = await readCopyrightThreadReferenceState(intake.id)
      const beforeRetention = await readCopyrightIntakeRetentionState(intake.id)
      const failure = Object.assign(new Error('reference admission serialization conflict'), {
        code,
      })
      let reachedInsert = false
      const restore = runBeforePostgresStatementForTest(
        '/* insertCopyrightEmailThreadReferences */',
        async () => {
          reachedInsert = true
          throw failure
        },
      )
      onTestFinished(restore)
      try {
        await expect(
          recordCopyrightEmailThreadReferences({
            intakeId: intake.id,
            messageId: `<new-${randomUUID()}@example.test>`,
            inReplyTo: [],
            references: [],
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          cause: failure,
        })
        expect(reachedInsert).toBe(true)
        expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
        expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
        expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(beforeRetention)
        expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toBeNull()
      } finally {
        restore()
      }
    },
  )

  it('derives the same case on replay after references commit without a graph link', async () => {
    const notice = await createRetentionMinimalCase()
    const parentMessageId = `<${randomUUID()}@example.test>`
    const parent = await createRetentionThreadSeedEmail('phase-parent', {
      messageId: parentMessageId,
      sesMessageId: notice.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(parent.id, notice.noticeId)
    const sesMessageId = `ses-phase-reply-${randomUUID()}`
    const { intake: reply } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: randomBytes(32),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const input = {
      intakeId: reply.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [parentMessageId],
      references: [] as string[],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    expect(await admitCopyrightEmailReferenceFacts(reply.id, rows)).toBe(true)
    const before = await readCopyrightThreadReferenceState(reply.id)
    const beforeRetention = await readCopyrightIntakeRetentionState(reply.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual([])

    let firstReplay: Awaited<ReturnType<typeof recordCopyrightEmailThreadReferences>>
    try {
      firstReplay = await recordCopyrightEmailThreadReferences(input)
    } catch (err) {
      await assertFirstReplayRolledBack(err, reply.id, before, beforeRetention)
      return
    }
    expect(firstReplay).toMatchObject({ noticeId: notice.noticeId, matchedIntakeId: parent.id })
    const linked = await readCopyrightEmailIntakeNoticeLinks(reply.id)
    expect(linked).toHaveLength(1)
    let secondReplay: Awaited<ReturnType<typeof recordCopyrightEmailThreadReferences>>
    try {
      secondReplay = await recordCopyrightEmailThreadReferences(input)
    } catch (err) {
      await assertSecondReplayRolledBack(
        err,
        reply.id,
        before,
        linked,
        beforeRetention.ancestorCount + 1,
      )
      return
    }
    expect(secondReplay).toMatchObject({ noticeId: notice.noticeId, matchedIntakeId: parent.id })
    expect(await readCopyrightEmailIntakeNoticeLinks(reply.id)).toEqual(linked)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
  })
})
