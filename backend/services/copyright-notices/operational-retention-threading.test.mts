import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  positionCopyrightOperationalCursor,
  readCopyrightThreadOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
  seedCopyrightIntakeAuditReview,
  seedCopyrightThreadPartySubmission,
  seedTestCopyrightAncestorEdge,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import { seedCopyrightThreadTokenAtForTest } from '@voucha/test-helpers/copyright-thread-retention'
import {
  assertAbortedCaseThreadPage,
  assertIncompleteFinalThreadRun,
} from '@voucha/test-helpers/copyright-thread-retention-assertions'
import { createTestUserDirect } from '@voucha/test-helpers/entities/index'
import {
  insertPreservationHoldForTest,
  releasePreservationHoldAtForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const future = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright operational thread retention', () => {
  useCopyrightOperationalCursorReservation()
  it('removes exclusive closed-case tokens, references and ancestor edges after the reply window', async () => {
    const notice = await createRetentionMinimalCase()
    const ancestor = await createRetentionParsedEmail('thread-ancestor', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('thread-reply', { reply: true })
    await linkTestCopyrightEmailIntake(ancestor.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
    await seedTestCopyrightAncestorEdge(reply.id, ancestor.id)
    const expirationNow = future(181)
    const youngTokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(expirationNow.getTime() - 30 * 60 * 1000),
      intakeId: reply.id,
    })
    const before = await readCopyrightThreadReferenceState(reply.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    expect(before.tokenId).toBeTruthy()
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const options = { now: future(179), replyDays: 180, batchSize: 10, maxBatches: 100 }
    await sweepCopyrightCaseThreads(options)
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(
      before.referenceCount,
    )
    expect((await readCopyrightIntakeRetentionState(reply.id)).ancestorCount).toBe(1)

    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    let deleted = 0
    for (let page = 0; page < 100; page++) {
      const pageCursor = await readCopyrightThreadOperationalCursor()
      const pageReferences = await readCopyrightThreadReferenceState(reply.id)
      const pageAncestors = (await readCopyrightIntakeRetentionState(reply.id)).ancestorCount
      const result = await sweepCopyrightCaseThreads({
        ...options,
        now: future(181),
        batchSize: 1,
        maxBatches: 1,
      })
      deleted += result.deleted
      if (deleted === 0 && !result.hasMore) {
        await assertAbortedCaseThreadPage(
          notice.noticeId,
          reply.id,
          pageReferences,
          pageCursor,
          pageAncestors,
        )
        return
      }
      if (deleted > 0 || !result.hasMore) break
    }
    expect(deleted).toBeGreaterThan(0)
    const betweenPages = await readCopyrightThreadReferenceState(reply.id)
    await expect(
      recordCopyrightEmailThreadReferences({
        intakeId: reply.id,
        messageId: '<expired-replay-between-pages@example.test>',
        inReplyTo: [],
        references: [],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'copyright_email_thread_changed' })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(betweenPages)
    const beforeFinal = await readCopyrightThreadReferenceState(reply.id)
    const beforeFinalAncestors = (await readCopyrightIntakeRetentionState(reply.id)).ancestorCount
    expect([0, 1]).toContain(beforeFinalAncestors)
    const finalCursor = await readCopyrightThreadOperationalCursor()
    const finalRun = await sweepCopyrightCaseThreads({ ...options, now: expirationNow })
    const afterFinal = await readCopyrightThreadReferenceState(reply.id)
    if (afterFinal.referenceCount > 0) {
      await assertIncompleteFinalThreadRun(
        notice.noticeId,
        reply.id,
        beforeFinal,
        afterFinal,
        finalRun,
        finalCursor,
        beforeFinalAncestors,
      )
      return
    }
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(0)
    expect((await readCopyrightIntakeRetentionState(reply.id)).ancestorCount).toBe(0)
    expect(await readCopyrightOperationalRow('email_thread_tokens', before.tokenId!)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', youngTokenId)).toBe(true)
    await expect(
      recordCopyrightEmailThreadReferences({
        intakeId: reply.id,
        messageId: null,
        inReplyTo: [],
        references: [],
      }),
    ).resolves.toBeNull()
    await expect(
      recordCopyrightEmailThreadReferences({
        intakeId: reply.id,
        messageId: '<expired-replay@example.test>',
        inReplyTo: [],
        references: [],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'copyright_email_thread_changed' })
    expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(0)
  })

  it('stops later cleanup pages when a linked intake receives a fresh staff review', async () => {
    const notice = await createRetentionMinimalCase()
    const first = await createRetentionParsedEmail('thread-reviewed-first', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const second = await createRetentionParsedEmail('thread-reviewed-second')
    await linkTestCopyrightEmailIntake(first.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(second.id, notice.noticeId, 'thread', notice.moderator.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const firstBefore = await readCopyrightThreadReferenceState(first.id)
    const options = { now: future(181), replyDays: 180, batchSize: 1, maxBatches: 1 }
    let deleted = 0
    for (let page = 0; page < 100; page++) {
      const result = await sweepCopyrightCaseThreads(options)
      deleted += result.deleted
      if (deleted > 0 || !result.hasMore) break
    }
    expect(deleted).toBeGreaterThan(0)
    expect((await readCopyrightThreadReferenceState(first.id)).referenceCount).toBeLessThan(
      firstBefore.referenceCount,
    )
    const beforeReview = await readCopyrightThreadReferenceState(second.id)
    expect(beforeReview.referenceCount).toBeGreaterThan(0)

    await seedCopyrightIntakeAuditReview(second.id, future(181))
    await sweepCopyrightCaseThreads({ ...options, maxBatches: 100 })
    expect(await readCopyrightThreadReferenceState(second.id)).toEqual(beforeReview)
  })

  it('allows thread cleanup after a hold placed between pages has been released', async () => {
    const notice = await createRetentionMinimalCase({ claimant: true })
    const intake = await createRetentionParsedEmail('thread-hold-release', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const options = { now: future(181), replyDays: 180, batchSize: 1, maxBatches: 1 }
    await sweepCopyrightCaseThreads(options)

    const holdId = await insertPreservationHoldForTest(notice.claimantId!, notice.moderator.id)
    await releasePreservationHoldAtForTest(holdId, notice.moderator.id, future(181))
    await sweepCopyrightCaseThreads({ ...options, maxBatches: 100 })
    const sibling = await createRetentionMinimalCase()
    const siblingIntake = await createRetentionParsedEmail('thread-hold-release-sibling', {
      sesMessageId: sibling.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(siblingIntake.id, sibling.noticeId)
    await positionCopyrightOperationalCursor('email_thread_references', sibling.noticeId)
    await sweepCopyrightCaseThreads({ ...options, maxBatches: 100 })
    expect((await readCopyrightThreadReferenceState(siblingIntake.id)).referenceCount).toBe(0)
    expect(before.referenceCount).toBeGreaterThan(0)
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual({
      tokenId: null,
      referenceCount: 0,
    })
  })

  it('checks a newly introduced held party before retirement', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail('thread-new-held-party', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(intake.id, notice.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    const party = await createTestUserDirect()
    await insertPreservationHoldForTest(party.id, notice.moderator.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const options = { now: future(181), replyDays: 180, batchSize: 1, maxBatches: 3 }
    await sweepCopyrightCaseThreads(options)

    await seedCopyrightThreadPartySubmission(notice.noticeId, party.id)
    await sweepCopyrightCaseThreads({ ...options, maxBatches: 100 })
    const sibling = await createRetentionMinimalCase()
    const siblingIntake = await createRetentionParsedEmail('thread-new-party-sibling', {
      sesMessageId: sibling.initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(siblingIntake.id, sibling.noticeId)
    await positionCopyrightOperationalCursor('email_thread_references', sibling.noticeId)
    await sweepCopyrightCaseThreads({ ...options, maxBatches: 100 })
    expect((await readCopyrightThreadReferenceState(siblingIntake.id)).referenceCount).toBe(0)
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
  })

  it('keeps thread references while the case has an active restriction', async () => {
    const initialEmailSesMessageId = `ses-blocked-thread-${randomUUID()}`
    const fixture = await createCopyrightNoticeSchemaFixture({ initialEmailSesMessageId })
    const intake = await createRetentionParsedEmail('blocked-thread', {
      sesMessageId: initialEmailSesMessageId,
    })
    await linkTestCopyrightEmailIntake(intake.id, fixture.noticeId)
    const before = await readCopyrightThreadReferenceState(intake.id)
    expect(before.referenceCount).toBeGreaterThan(0)
    await positionCopyrightOperationalCursor('email_thread_references', fixture.noticeId)
    await sweepCopyrightCaseThreads({
      now: future(181),
      replyDays: 180,
      batchSize: 10,
      maxBatches: 100,
    })
    expect(await readCopyrightThreadReferenceState(intake.id)).toEqual(before)
    expect(await readCopyrightOperationalRow('email_thread_tokens', before.tokenId!)).toBe(true)
  })

  it('retains a shared token and edge owned by an active case', async () => {
    const expired = await createRetentionMinimalCase()
    const activeSesMessageId = `ses-shared-active-${randomUUID()}`
    const active = await createCopyrightNoticeSchemaFixture({
      initialEmailSesMessageId: activeSesMessageId,
    })
    const messageId = `<shared-retention-${randomUUID()}@example.test>`
    const expiredIntake = await createRetentionParsedEmail('shared-expired', {
      messageId,
      sesMessageId: expired.initialEmailSesMessageId,
    })
    const activeIntake = await createRetentionParsedEmail('shared-active', {
      messageId,
      sesMessageId: activeSesMessageId,
    })
    await linkTestCopyrightEmailIntake(expiredIntake.id, expired.noticeId)
    await linkTestCopyrightEmailIntake(activeIntake.id, active.noticeId)
    await seedTestCopyrightAncestorEdge(expiredIntake.id, activeIntake.id)
    const expiredBefore = await readCopyrightThreadReferenceState(expiredIntake.id)
    const activeBefore = await readCopyrightThreadReferenceState(activeIntake.id)
    expect(expiredBefore.tokenId).toBe(activeBefore.tokenId)
    await positionCopyrightOperationalCursor('email_thread_references', expired.noticeId)
    await sweepCopyrightCaseThreads({
      now: future(181),
      replyDays: 180,
      batchSize: 1,
      maxBatches: 100,
    })
    expect((await readCopyrightThreadReferenceState(expiredIntake.id)).referenceCount).toBe(0)
    expect(await readCopyrightThreadReferenceState(activeIntake.id)).toEqual(activeBefore)
    expect(await readCopyrightOperationalRow('email_thread_tokens', expiredBefore.tokenId!)).toBe(
      true,
    )
    expect((await readCopyrightIntakeRetentionState(activeIntake.id)).ancestorCount).toBe(1)
  })
})
