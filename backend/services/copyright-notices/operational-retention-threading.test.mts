import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightIntakeRetentionState,
  readCopyrightThreadReferenceState,
  seedCopyrightThreadRetirement,
  seedTestCopyrightAncestorEdge,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  linkCopyrightEmailIntakeToNotice,
  recordCopyrightEmailThreadReferences,
} from './email-threading.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational thread retention', () => {
  it('removes exclusive closed-case tokens, references and ancestor edges after the reply window', async () => {
    const notice = await createRetentionMinimalCase()
    const ancestor = await createRetentionParsedEmail('thread-ancestor')
    const reply = await createRetentionParsedEmail('thread-reply', { reply: true })
    await linkTestCopyrightEmailIntake(ancestor.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId)
    await seedTestCopyrightAncestorEdge(reply.id, ancestor.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    expect(before.tokenId).toBeTruthy()
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const options = { now: future(179), replyDays: 180, batchSize: 10, maxBatches: 10 }
    await sweepCopyrightCaseThreads(options)
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(
      before.referenceCount,
    )
    expect((await readCopyrightIntakeRetentionState(reply.id)).ancestorCount).toBe(1)

    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    await sweepCopyrightCaseThreads({ ...options, now: future(181), batchSize: 1, maxBatches: 1 })
    const betweenPages = await readCopyrightThreadReferenceState(reply.id)
    await recordCopyrightEmailThreadReferences({
      intakeId: reply.id,
      messageId: '<expired-replay-between-pages@example.test>',
      inReplyTo: [],
      references: [],
    })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(betweenPages)
    await sweepCopyrightCaseThreads({ ...options, now: future(181) })
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(0)
    expect((await readCopyrightIntakeRetentionState(reply.id)).ancestorCount).toBe(0)
    expect(await readCopyrightOperationalRow('email_thread_tokens', before.tokenId!)).toBe(false)
    await recordCopyrightEmailThreadReferences({
      intakeId: reply.id,
      messageId: '<expired-replay@example.test>',
      inReplyTo: [],
      references: [],
    })
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(0)
  })

  it('allows a fresh source to thread after an older intake high-water retired', async () => {
    const notice = await createRetentionMinimalCase()
    const fresh = await createRetentionParsedEmail('fresh-after-retirement')
    await seedCopyrightThreadRetirement(
      notice.noticeId,
      getMinUUIDv7ForDate(new Date(Date.now() - 180 * DAY_MS)),
    )
    await expect(
      linkCopyrightEmailIntakeToNotice({
        intakeId: fresh.id,
        noticeId: notice.noticeId,
        linkKind: 'thread',
      }),
    ).resolves.toBe(true)
    await recordCopyrightEmailThreadReferences({
      intakeId: fresh.id,
      messageId: '<fresh-after-retirement@example.test>',
      inReplyTo: [],
      references: [],
    })
    expect((await readCopyrightThreadReferenceState(fresh.id)).referenceCount).toBeGreaterThan(0)
  })

  it('keeps thread references while the case has an active restriction', async () => {
    const fixture = await createCopyrightNoticeSchemaFixture()
    const intake = await createRetentionParsedEmail('blocked-thread')
    await linkTestCopyrightEmailIntake(intake.id, fixture.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    await positionCopyrightOperationalCursor('email_thread_references', fixture.noticeId)
    await sweepCopyrightCaseThreads({
      now: future(181),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 10,
    })
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
    expect(await readCopyrightOperationalRow('email_thread_tokens', before.tokenId!)).toBe(true)
  })
})
