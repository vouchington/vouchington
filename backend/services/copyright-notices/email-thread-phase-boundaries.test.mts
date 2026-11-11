import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
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
import { deriveCopyrightEmailThread } from './email-thread-derive.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepUnlinkedCopyrightEmailIntakes } from './operational-retention-email-intakes.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1000

async function assertFirstReplayRolledBack(
  err: unknown,
  intakeId: string,
  before: Awaited<ReturnType<typeof readCopyrightThreadReferenceState>>,
  beforeRetention: Awaited<ReturnType<typeof readCopyrightIntakeRetentionState>>,
): Promise<void> {
  expect(err).toMatchObject({ status: 409, cause: { code: '40001' } })
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
  expect(err).toMatchObject({ status: 409, cause: { code: '40001' } })
  expect(await readCopyrightEmailIntakeNoticeLinks(intakeId)).toEqual(links)
  expect(await readCopyrightThreadReferenceState(intakeId)).toEqual(before)
  expect((await readCopyrightIntakeRetentionState(intakeId)).ancestorCount).toBe(
    expectedAncestorCount,
  )
}

describe('copyright email reference admission and graph derivation', () => {
  useCopyrightOperationalCursorReservation()

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
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
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
    const admission = admitCopyrightEmailReferenceFacts(intake.id, rows)
    try {
      await atTokenInsert.promise
      const erased = await sweepUnlinkedCopyrightEmailIntakes({
        now: new Date(Date.now() + 91 * DAY_MS),
        retentionDays: 90,
        childLimit: 20,
        maxBatches: 1,
      })
      expect(erased.erased).toBe(1)
      releaseTokenInsert.resolve()
      await expect(admission).resolves.toBe(false)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).not.toBeNull()
      expect((await readCopyrightIntakeRetentionState(intake.id)).receiptExists).toBe(true)
      expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(0)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    } finally {
      releaseTokenInsert.resolve()
      await admission
      restore()
    }
  })

  it('maps an admission serialization failure to 409 and rolls back reference facts', async () => {
    const intake = await createRetentionThreadSeedEmail('phase-admission-conflict', {
      messageId: `<seed-${randomUUID()}@example.test>`,
    })
    const before = await readCopyrightThreadReferenceState(intake.id)
    const beforeRetention = await readCopyrightIntakeRetentionState(intake.id)
    const failure = Object.assign(new Error('reference admission serialization conflict'), {
      code: '40001',
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
      ).rejects.toMatchObject({ status: 409, cause: failure })
      expect(reachedInsert).toBe(true)
      expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
      expect(await readCopyrightIntakeRetentionState(intake.id)).toEqual(beforeRetention)
      expect(await readCopyrightEmailReceiptErasedAt(intake.id)).toBeNull()
    } finally {
      restore()
    }
  })

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

  it('leaves an erased unlinked intake without a derived case link', async () => {
    const sesMessageId = `ses-phase-erasure-${randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: randomBytes(32),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const input = {
      intakeId: intake.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [] as string[],
      references: [] as string[],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    expect(await admitCopyrightEmailReferenceFacts(intake.id, rows)).toBe(true)
    const before = await readCopyrightThreadReferenceState(intake.id)
    await positionCopyrightOperationalCursor('unlinked_email_intakes', intake.id)
    await expect(
      sweepUnlinkedCopyrightEmailIntakes({
        now: new Date(Date.now() + 91 * DAY_MS),
        retentionDays: 90,
        childLimit: 20,
        maxBatches: 1,
      }),
    ).resolves.toMatchObject({ erased: 1 })
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toBeNull()
    await expect(recordCopyrightEmailThreadReferences(input)).resolves.toBeNull()
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
  })

  it('does not derive a case link after the linked intake crosses retirement high-water', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionThreadSeedEmail('phase-retirement', {
      sesMessageId: notice.initialEmailSesMessageId,
      messageId: `<seed-${randomUUID()}@example.test>`,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const input = {
      intakeId: intake.id,
      messageId: `<${randomUUID()}@example.test>`,
      inReplyTo: [] as string[],
      references: [] as string[],
    }
    const rows = buildCopyrightEmailThreadReferenceRows(input)
    expect(await admitCopyrightEmailReferenceFacts(intake.id, rows)).toBe(true)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    await sweepCopyrightCaseThreads({
      now: new Date(Date.now() + 181 * DAY_MS),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    const after = await readCopyrightThreadReferenceState(intake.id)
    await expect(deriveCopyrightEmailThread(input, rows)).resolves.toBeNull()
    await expect(recordCopyrightEmailThreadReferences(input)).resolves.toBeNull()
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(after)
  })
})
