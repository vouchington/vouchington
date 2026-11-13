import {
  observeOwnedCopyrightSweep,
  assertOwnedCopyrightThreadSweep,
} from '@voucha/test-helpers/copyright-thread-retention-assertions'
import { createTestUser } from '@voucha/test-helpers'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../users/preservation-holds.mts'
import { describe, expect, it } from 'vitest'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  seedCopyrightIntakeAuditReview,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  admitCopyrightEmailDuringThreadProof,
  holdCopyrightCaseBeforeThreadEligibility,
} from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const day = 24 * 60 * 60 * 1000
const future = (days: number) => new Date(Date.now() + days * day)

describe('copyright thread proof and correspondence admission', () => {
  it('stops later cleanup pages when a linked intake receives a fresh staff review', async () => {
    const notice = await createRetentionMinimalCase()
    const first = await createRetentionParsedEmail('thread-reviewed-first', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const second = await createRetentionParsedEmail('thread-reviewed-second')
    await linkTestCopyrightEmailIntake(first.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(second.id, notice.noticeId, 'thread', notice.moderator.id)
    const scope3 = createCopyrightOperationalScope([notice.noticeId])
    const firstBefore = await readCopyrightThreadReferenceState(first.id)
    const options = { now: future(181), replyDays: 180, batchSize: 1, maxBatches: 1 }
    const observed = await observeOwnedCopyrightSweep(scope3, async () => {
      let deleted = 0
      for (let page = 0; page < 100; page++) {
        const result = await sweepCopyrightCaseThreads({ ...options, scope: scope3 })
        deleted += result.deleted
        if (deleted > 0 || !result.hasMore) break
      }
      return { deleted }
    })
    await assertOwnedCopyrightThreadSweep({
      scope: scope3,
      noticeId: notice.noticeId,
      intakeId: first.id,
      before: firstBefore,
      observed,
    })
    const beforeReview = await readCopyrightThreadReferenceState(second.id)
    expect(beforeReview.referenceCount).toBeGreaterThan(0)

    await seedCopyrightIntakeAuditReview(second.id, future(181))
    await sweepCopyrightCaseThreads({ scope: scope3, ...options, maxBatches: 100 })
    expect(await readCopyrightThreadReferenceState(second.id)).toEqual(beforeReview)
  })

  it('keeps the committed review and its source when admission overlaps the blocker proof', async () => {
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('proof-race-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('proof-race-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.noticeId,
      intakeId: reply.id,
      linkKind: 'thread',
    })
    const before = await readCopyrightThreadReferenceState(reply.id)
    const scope1 = createCopyrightOperationalScope([notice.noticeId])
    const result = await admitCopyrightEmailDuringThreadProof(
      {
        currentUser: notice.moderator,
        intakeId: reply.id,
        kind: 'supplement',
        targetIds: [],
        structuredSubmission: { summary: 'Reviewed supplemental evidence.' },
        rationale: 'Confirmed supplemental evidence.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      },
      notice.noticeId,
      () =>
        sweepCopyrightCaseThreads({
          scope: scope1,
          now: new Date(Date.now() + 181 * day),
          replyDays: 180,
          batchSize: 10,
          maxBatches: 5,
        }),
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.noticeId)
    const success = expect.objectContaining({
      status: 'fulfilled',
      value: expect.objectContaining({ noticeId: notice.noticeId, isDuplicate: false }),
    })
    const conflict = expect.objectContaining({
      status: 'rejected',
      reason: expect.objectContaining({
        status: 409,
        code: 'CONFLICT',
        cause: expect.objectContaining({ code: '40001' }),
      }),
    })
    const state = {
      admission: result.admission,
      deleted: result.sweep.deleted > 0,
      references: await readCopyrightThreadReferenceState(reply.id),
      reviews: aggregate?.emailCorrespondenceReviews.map(row => ({
        action: row.action,
        intakeId: row.copyright_notice_email_intake_id,
      })),
      supplements: aggregate?.submissions.filter(row => row.kind === 'supplement').length,
    }
    expect([
      {
        admission: success,
        deleted: false,
        references: before,
        reviews: [{ action: 'admitted', intakeId: reply.id }],
        supplements: 1,
      },
      { admission: conflict, deleted: false, references: before, reviews: [], supplements: 0 },
      {
        admission: conflict,
        deleted: true,
        references: { tokenId: null, referenceCount: 0 },
        reviews: [],
        supplements: 0,
      },
    ]).toContainEqual(state)
  })
  it('retains thread evidence when an account hold commits after the completed blocker proof', async () => {
    const admin = await createTestUser({ administrator: true })
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('proof-hold-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('proof-hold-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    const scope2 = createCopyrightOperationalScope([notice.noticeId])
    const serializationFailures: unknown[] = []
    let holdPlaced = false
    let hold: unknown
    try {
      const result = await holdCopyrightCaseBeforeThreadEligibility(
        notice.noticeId,
        async () => {
          hold = await placeUserPreservationHold(
            admin,
            notice.posterId,
            'hold-before-thread-retirement',
          )
            .then(value => {
              holdPlaced = true
              return { status: 'fulfilled', value }
            })
            .catch((err: unknown) => ({ status: 'rejected', reason: err }))
        },
        () =>
          sweepCopyrightCaseThreads({
            scope: scope2,
            now: new Date(Date.now() + 181 * day),
            replyDays: 180,
            batchSize: 10,
            maxBatches: 100,
          }),
        err => serializationFailures.push(err),
      )
      const native = expect.objectContaining({ code: '40001' })
      const success = expect.objectContaining({ status: 'fulfilled' })
      const conflict = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409, code: 'CONFLICT', cause: native }),
      })
      expect([
        { hold: success, deleted: false, references: before, failures: [native] },
        { hold: success, deleted: false, references: before, failures: [] },
        { hold: conflict, deleted: false, references: before, failures: [native] },
        {
          hold: conflict,
          deleted: true,
          references: { tokenId: null, referenceCount: 0 },
          failures: [],
        },
      ]).toContainEqual({
        hold,
        deleted: result.deleted > 0,
        references: await readCopyrightThreadReferenceState(reply.id),
        failures: serializationFailures,
      })
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, notice.posterId)
    }
  })
})
