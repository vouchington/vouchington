import { describe, expect, it } from 'vitest'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  confirmCopyrightRestrictionReview,
  attachCopyrightPagingDeadlineTarget,
  insertAssessedCopyrightLegalHold,
  insertCopyrightPagingTarget,
  insertOpenCopyrightDeadline,
  insertUnreviewedCopyrightSubmission,
} from '@voucha/test-helpers/data-stores/psql/copyright-review-target'
import { readCopyrightReviewTargetBreaches } from './index.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import {
  failTestCopyrightActionIntent,
  failTestCopyrightDeliveryIntent,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000)
const none = { count: 0, noticeIds: [] }
async function fixtureWithDeadline() {
  const fixture = await createCopyrightNoticeSchemaFixture()
  await confirmCopyrightRestrictionReview(fixture)
  const deadlineId = await insertOpenCopyrightDeadline({
    ...fixture,
    targetId: fixture.targetId,
    escalationAt: hoursAgo(2),
    restorationDeadlineAt: hoursAgo(1),
  })
  return { ...fixture, deadlineId }
}

describe('actionable copyright review paging', () => {
  it('does not page a deadline held by an assessed qualifying hold', async () => {
    const fixture = await fixtureWithDeadline()
    await insertAssessedCopyrightLegalHold({ ...fixture, receivedAt: hoursAgo(3) })
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: 60,
      noticeIds: [fixture.noticeId],
    })
    expect(read.waitingPastTarget).toEqual(none)
    expect(read.missedEscalation).toEqual(none)
    expect(read.missedRestorationDeadline).toEqual(none)
  })
  it('never makes a future-at-assessment receipt qualify as the sweep clock advances', async () => {
    const fixture = await fixtureWithDeadline()
    const now = new Date()
    await insertAssessedCopyrightLegalHold({
      ...fixture,
      receivedAt: hoursAgo(3),
      agentReceivedAt: new Date(now.getTime() + 3_600_000),
    })
    for (const sweepAt of [now, new Date(now.getTime() + 2 * 3_600_000)]) {
      const read = await readCopyrightReviewTargetBreaches({
        now: sweepAt,
        reviewTargetMinutes: 60,
        noticeIds: [fixture.noticeId],
      })
      expect(read.missedEscalation).toEqual({ count: 1, noticeIds: [fixture.noticeId] })
      expect(read.missedRestorationDeadline).toEqual({ count: 1, noticeIds: [fixture.noticeId] })
    }
  })
  it('pages a partially held deadline until every restricted target is covered', async () => {
    const fixture = await fixtureWithDeadline()
    const extraTarget = await insertCopyrightPagingTarget(fixture.noticeId, fixture.imageId)
    await attachCopyrightPagingDeadlineTarget({
      deadlineId: fixture.deadlineId,
      targetId: extraTarget,
      restrictionId: fixture.restrictionId,
    })
    await insertAssessedCopyrightLegalHold({ ...fixture, receivedAt: hoursAgo(3) })
    const read = () =>
      readCopyrightReviewTargetBreaches({
        now: new Date(),
        reviewTargetMinutes: 60,
        noticeIds: [fixture.noticeId],
      })
    expect((await read()).missedRestorationDeadline).toEqual({
      count: 1,
      noticeIds: [fixture.noticeId],
    })
    await insertAssessedCopyrightLegalHold({
      ...fixture,
      targetId: extraTarget,
      receivedAt: hoursAgo(3),
    })
    expect((await read()).missedRestorationDeadline).toEqual(none)
  })

  it.each(['unassessed', 'other targets', 'resolved', 'non-qualifying'] as const)(
    'still pages a missed deadline with %s',
    async kind => {
      const fixture = await fixtureWithDeadline()
      const other =
        kind === 'other targets'
          ? {
              ...fixture,
              targetId: await insertCopyrightPagingTarget(fixture.noticeId, fixture.imageId),
            }
          : fixture
      if (kind === 'unassessed') {
        await insertUnreviewedCopyrightSubmission({
          noticeId: fixture.noticeId,
          kind: 'court_or_ccb_hold',
          receivedAt: hoursAgo(3),
        })
      } else {
        await insertAssessedCopyrightLegalHold({
          ...other,
          qualifying: kind !== 'non-qualifying',
          resolved: kind === 'resolved',
          receivedAt: hoursAgo(3),
        })
      }
      const read = await readCopyrightReviewTargetBreaches({
        now: new Date(),
        reviewTargetMinutes: 60,
        noticeIds: [fixture.noticeId],
      })
      expect(read.missedEscalation).toEqual({ count: 1, noticeIds: [fixture.noticeId] })
      expect(read.missedRestorationDeadline).toEqual({ count: 1, noticeIds: [fixture.noticeId] })
    },
  )
  it('pages an unassessed filing as waiting, not a qualifying hold awaiting resolution', async () => {
    const unassessed = await createCopyrightNoticeSchemaFixture()
    const assessed = await createCopyrightNoticeSchemaFixture()
    await confirmCopyrightRestrictionReview(unassessed)
    await confirmCopyrightRestrictionReview(assessed)
    await insertUnreviewedCopyrightSubmission({
      noticeId: unassessed.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: hoursAgo(3),
    })
    await insertAssessedCopyrightLegalHold({ ...assessed, receivedAt: hoursAgo(3) })
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: 60,
      noticeIds: [unassessed.noticeId, assessed.noticeId],
    })
    expect(read.waitingPastTarget).toEqual({ count: 1, noticeIds: [unassessed.noticeId] })
  })
  it('pages failed delivery and action on the same review target timer', async () => {
    const action = await createCopyrightNoticeSchemaFixture()
    const delivery = await createCopyrightNoticeSchemaFixture()
    await confirmCopyrightRestrictionReview(action)
    await confirmCopyrightRestrictionReview(delivery)
    await failTestCopyrightActionIntent(action.actionIntentId)
    const intent = await createCopyrightDeliveryIntent({
      noticeId: delivery.noticeId,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: delivery.actorUserId,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'in_app',
      idempotencyKey: crypto.randomUUID(),
    })
    await failTestCopyrightDeliveryIntent(intent.id)
    const now = new Date(Date.now() + 2 * 3_600_000)
    const read = (reviewTargetMinutes: number) =>
      readCopyrightReviewTargetBreaches({
        now,
        reviewTargetMinutes,
        noticeIds: [action.noticeId, delivery.noticeId],
      })
    expect((await read(60)).waitingPastTarget.count).toBe(2)
    expect((await read(240)).waitingPastTarget).toEqual(none)
  })
})
