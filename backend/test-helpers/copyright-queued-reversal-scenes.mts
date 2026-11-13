import { createTestUser, createTestUserDirect } from './index.mts'
import { createEffectiveReviewNotice } from './copyright-effective-review-fixtures.mts'
import { seedEffectiveConfirmation } from './copyright-effective-review-decisions.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'

/** Complete reversal authority retains its never-executed withhold as a separate pending obligation. */
export async function createQueuedReversalScene() {
  const [poster, moderator] = await Promise.all([
    createTestUserDirect(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const fixture = await createEffectiveReviewNotice([poster.id], moderator)
  const restriction = fixture.restrictions[0]!
  await seedEffectiveConfirmation(fixture.noticeId, restriction.id, moderator, 'reverse')
  const aggregate = (await getCopyrightNoticePrivateAggregate(fixture.noticeId))!
  const target = aggregate.targets[0]!
  const restore = aggregate.actionIntents.find(row => row.action === 'restore')
  const withhold = aggregate.actionIntents.find(row => row.action === 'withhold')
  if (!restore || !withhold) throw new Error('Owned queued reversal obligations disappeared')
  return {
    noticeId: fixture.noticeId,
    restrictionId: restriction.id,
    placementId: target.placement_id,
    accountId: poster.id,
    restore,
    withhold,
  }
}
