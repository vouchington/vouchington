import { describe, expect, it } from 'vitest'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  cancelCopyrightDeadline,
  confirmCopyrightRestrictionReview,
  insertOpenCopyrightDeadline,
  insertUnreviewedCopyrightSubmission,
} from '@voucha/test-helpers/data-stores/psql/copyright-review-target'
import { readCopyrightReviewTargetBreaches } from './index.mts'

const HOUR_MS = 60 * 60 * 1000
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS)
const none = { count: 0, noticeIds: [] }
const noEmails = { count: 0, emailIntakeIds: [] }

/** A notice whose only restriction a moderator has already confirmed, so nothing else waits. */
async function createReviewedNotice(): Promise<{ noticeId: string; actorUserId: string }> {
  const fixture = await createCopyrightNoticeSchemaFixture()
  await confirmCopyrightRestrictionReview({
    restrictionId: fixture.restrictionId,
    actorUserId: fixture.actorUserId,
  })
  return { noticeId: fixture.noticeId, actorUserId: fixture.actorUserId }
}

describe('readCopyrightReviewTargetBreaches', () => {
  it('counts nothing while the target is unset and no deadline is missed', async () => {
    const { noticeId } = await createCopyrightNoticeSchemaFixture()

    const breaches = await readCopyrightReviewTargetBreaches({
      now: hoursFromNow(24),
      reviewTargetMinutes: null,
      noticeIds: [noticeId],
    })

    expect(breaches).toEqual({
      waitingPastTarget: none,
      missedEscalation: none,
      missedRestorationDeadline: none,
      emailIntakesWaitingPastTarget: noEmails,
    })
  })

  it('counts an unreviewed restriction once it waits past the target', async () => {
    const { noticeId } = await createCopyrightNoticeSchemaFixture()
    const read = (reviewTargetMinutes: number) =>
      readCopyrightReviewTargetBreaches({
        now: hoursFromNow(2),
        reviewTargetMinutes,
        noticeIds: [noticeId],
      })

    expect((await read(60)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
    expect((await read(4 * 60)).waitingPastTarget).toEqual(none)
  })

  it('stops counting a restriction once a moderator reviews it', async () => {
    const { noticeId } = await createReviewedNotice()

    const breaches = await readCopyrightReviewTargetBreaches({
      now: hoursFromNow(2),
      reviewTargetMinutes: 1,
      noticeIds: [noticeId],
    })

    expect(breaches.waitingPastTarget).toEqual(none)
  })

  it.each(['appeal', 'counter_notice', 'court_or_ccb_hold'] as const)(
    'counts an unreviewed %s from when it was received',
    async kind => {
      const { noticeId } = await createReviewedNotice()
      await insertUnreviewedCopyrightSubmission({ noticeId, kind, receivedAt: hoursFromNow(-3) })
      const read = (reviewTargetMinutes: number) =>
        readCopyrightReviewTargetBreaches({
          now: new Date(),
          reviewTargetMinutes,
          noticeIds: [noticeId],
        })

      expect((await read(60)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
      expect((await read(4 * 60)).waitingPastTarget).toEqual(none)
    },
  )

  it('counts missed escalation and restoration deadlines even with the target unset', async () => {
    const { noticeId, actorUserId } = await createReviewedNotice()
    await insertOpenCopyrightDeadline({
      noticeId,
      actorUserId,
      escalationAt: hoursFromNow(-1),
      restorationDeadlineAt: hoursFromNow(24),
    })
    const read = (now: Date) =>
      readCopyrightReviewTargetBreaches({ now, reviewTargetMinutes: null, noticeIds: [noticeId] })

    expect(await read(new Date())).toEqual({
      waitingPastTarget: none,
      missedEscalation: { count: 1, noticeIds: [noticeId] },
      missedRestorationDeadline: none,
      emailIntakesWaitingPastTarget: noEmails,
    })
    expect(await read(hoursFromNow(48))).toEqual({
      waitingPastTarget: none,
      missedEscalation: { count: 1, noticeIds: [noticeId] },
      missedRestorationDeadline: { count: 1, noticeIds: [noticeId] },
      emailIntakesWaitingPastTarget: noEmails,
    })
  })

  it('does not count the accepted counter-notice behind a deadline as waiting', async () => {
    const { noticeId, actorUserId } = await createReviewedNotice()
    await insertOpenCopyrightDeadline({
      noticeId,
      actorUserId,
      escalationAt: hoursFromNow(240),
      restorationDeadlineAt: hoursFromNow(264),
    })

    const breaches = await readCopyrightReviewTargetBreaches({
      now: hoursFromNow(2),
      reviewTargetMinutes: 1,
      noticeIds: [noticeId],
    })

    expect(breaches.waitingPastTarget).toEqual(none)
    expect(breaches.missedEscalation).toEqual(none)
  })

  it('counts a deadline past escalation only as missed, not also as waiting', async () => {
    const { noticeId, actorUserId } = await createReviewedNotice()
    await insertOpenCopyrightDeadline({
      noticeId,
      actorUserId,
      escalationAt: hoursFromNow(-3),
      restorationDeadlineAt: hoursFromNow(24),
    })

    const breaches = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: 60,
      noticeIds: [noticeId],
    })

    expect(breaches.waitingPastTarget).toEqual(none)
    expect(breaches.missedEscalation).toEqual({ count: 1, noticeIds: [noticeId] })
  })

  it('ignores a cancelled deadline', async () => {
    const { noticeId, actorUserId } = await createReviewedNotice()
    const deadlineId = await insertOpenCopyrightDeadline({
      noticeId,
      actorUserId,
      escalationAt: hoursFromNow(-2),
      restorationDeadlineAt: hoursFromNow(-1),
    })
    await cancelCopyrightDeadline(deadlineId)

    const breaches = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: null,
      noticeIds: [noticeId],
    })

    expect(breaches.missedEscalation).toEqual(none)
    expect(breaches.missedRestorationDeadline).toEqual(none)
  })

  it('lists notice ids with the oldest missed deadline first', async () => {
    const older = await createReviewedNotice()
    const newer = await createReviewedNotice()
    for (const [notice, hoursAgo] of [
      [newer, 1],
      [older, 5],
    ] as const) {
      await insertOpenCopyrightDeadline({
        ...notice,
        escalationAt: hoursFromNow(-hoursAgo),
        restorationDeadlineAt: hoursFromNow(24),
      })
    }

    const breaches = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: null,
      noticeIds: [newer.noticeId, older.noticeId],
    })

    expect(breaches.missedEscalation).toEqual({
      count: 2,
      noticeIds: [older.noticeId, newer.noticeId],
    })
  })
})
