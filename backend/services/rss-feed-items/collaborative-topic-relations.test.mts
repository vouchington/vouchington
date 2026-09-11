import { describe, expect, it } from 'vitest'
import {
  applyCollaborativeTopicRelations,
  type CollaborativeTopicLimits,
} from './collaborative-topic-relations.mts'
import { getRssFeedItemById } from './get.mts'
import { upsertRssFeedItemCategories } from './categories.mts'
import { createTopicAliases } from '@services/topics/aliases'
import { addUrl } from '@services/urls/upsert'
import type { EntityRelation } from '@services/entity-relations/upsert-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  createTestUser,
  createTestMembership,
  createTestTopic,
  createRandomString,
  insertTestRssFeedItem,
  insertTestRssFeedDirect,
  insertEntityRelation,
  followTopicById,
  softDeleteTopic,
  endTestMembershipProjection,
  mergeTopicForTest,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'

async function setupItem(): Promise<{ feedId: string; itemId: string }> {
  const feed = await insertTestRssFeedDirect({})
  const urlEntry = await addUrl(
    null,
    `https://collab-test-${createRandomString(8)}.example.com/item`,
  )
  const guid = `collab-item-${createRandomString(12)}`
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feed.id,
    urlId: urlEntry!.id,
    guid,
    itemData: { link: 'https://example.com', guid, title: 'Collab Test Item' },
    contentSha256: Buffer.alloc(32),
  })
  return { feedId: feed.id, itemId }
}

async function createPaidFollower(feedId: string, plan: 'plus' | 'pro'): Promise<PrivateUser> {
  const user = await createTestUser()
  await createTestMembership({ user_id: user.id, plan })
  await insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId)
  return user
}

async function getItemCategoryTopicIds(itemId: string): Promise<string[]> {
  const item = await getRssFeedItemById(itemId)
  return (item?.categories ?? []).map(c => c.topic?.id).filter((id): id is string => Boolean(id))
}

// applyCollaborativeTopicRelations enqueues its vote-stats recompute fire-and-forget (see its own
// doc comment); the view column backing getItemCategoryTopicIds is gated on that recompute having
// landed, so every call site here must wait for it before reading category/vote-gated data back.
// Poll the observable read instead of listening on the worker's job-completion event --
// backend/services/* must never depend on backend/workers/* (workers/CLAUDE.md: workers depend on
// services, never the reverse; mirrors the precedent in
// backend/services/users/__tests__/create.test.mts). Waiting for every written relation's
// object_id to appear (rather than e.g. a total-length match) stays correct even when the item
// already has unrelated pre-existing categories tagged outside this call.
async function applyAndAwaitVoteStats(
  itemId: string,
  limits: CollaborativeTopicLimits,
): Promise<EntityRelation[]> {
  const relations = await applyCollaborativeTopicRelations(itemId, limits)
  const newTopicIds = relations.map(relation => relation.object_id)
  await expect
    .poll(() => getItemCategoryTopicIds(itemId))
    .toEqual(expect.arrayContaining(newTopicIds))
  return relations
}

describe('applyCollaborativeTopicRelations', () => {
  it('includes current past-due followers and excludes inactive paid followers', async () => {
    const { feedId, itemId } = await setupItem()
    const pastDueTopic = await createTestTopic({})
    const pausedTopic = await createTestTopic({})
    const cancelledTopic = await createTestTopic({})
    const expiredTopic = await createTestTopic({})
    const elapsedTopic = await createTestTopic({})
    const endedProjectionTopic = await createTestTopic({})
    const pastDueFollower = await createTestUser()
    const pausedFollower = await createTestUser()
    const cancelledFollower = await createTestUser()
    const expiredFollower = await createTestUser()
    const elapsedFollower = await createTestUser()
    const endedProjectionFollower = await createTestUser()
    const [, , , , elapsedMembership, endedProjectionMembership] = await Promise.all([
      createTestMembership({ user_id: pastDueFollower.id, plan: 'plus', status: 'past_due' }),
      createTestMembership({ user_id: pausedFollower.id, plan: 'plus', status: 'paused' }),
      createTestMembership({ user_id: cancelledFollower.id, plan: 'plus', status: 'cancelled' }),
      createTestMembership({ user_id: expiredFollower.id, plan: 'plus', status: 'expired' }),
      createTestMembership({ user_id: elapsedFollower.id, plan: 'plus' }),
      createTestMembership({ user_id: endedProjectionFollower.id, plan: 'plus' }),
    ])
    await Promise.all([
      updateTestMembershipExpiresAt(elapsedMembership.id, new Date(Date.now() - 60_000)),
      endTestMembershipProjection(endedProjectionMembership.id),
      insertEntityRelation('relation__user__follow__rss_feed', pastDueFollower.id, feedId),
      insertEntityRelation('relation__user__follow__rss_feed', pausedFollower.id, feedId),
      insertEntityRelation('relation__user__follow__rss_feed', cancelledFollower.id, feedId),
      insertEntityRelation('relation__user__follow__rss_feed', expiredFollower.id, feedId),
      insertEntityRelation('relation__user__follow__rss_feed', elapsedFollower.id, feedId),
      insertEntityRelation('relation__user__follow__rss_feed', endedProjectionFollower.id, feedId),
      followTopicById(pastDueFollower.id, pastDueTopic.id),
      followTopicById(pausedFollower.id, pausedTopic.id),
      followTopicById(cancelledFollower.id, cancelledTopic.id),
      followTopicById(expiredFollower.id, expiredTopic.id),
      followTopicById(elapsedFollower.id, elapsedTopic.id),
      followTopicById(endedProjectionFollower.id, endedProjectionTopic.id),
    ])

    await applyAndAwaitVoteStats(itemId, { plusLimit: 6, proLimit: 0 })

    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toEqual([pastDueTopic.id])
  })

  it('is a no-op when the item has zero paid followers', async () => {
    const { itemId } = await setupItem()

    await expect(applyAndAwaitVoteStats(itemId, { plusLimit: 3, proLimit: 4 })).resolves.toEqual([])

    expect(await getItemCategoryTopicIds(itemId)).toHaveLength(0)
  })

  it('caps the plus pool at plusLimit, ranked by follower count desc', async () => {
    const { feedId, itemId } = await setupItem()
    const topicHigh = await createTestTopic({})
    const topicMid = await createTestTopic({})
    const topicLow = await createTestTopic({})

    const followerA = await createPaidFollower(feedId, 'plus')
    const followerB = await createPaidFollower(feedId, 'plus')
    const followerC = await createPaidFollower(feedId, 'plus')

    // topicHigh: 3 followers, topicMid: 2 followers, topicLow: 1 follower
    await Promise.all([
      followTopicById(followerA.id, topicHigh.id),
      followTopicById(followerB.id, topicHigh.id),
      followTopicById(followerC.id, topicHigh.id),
      followTopicById(followerA.id, topicMid.id),
      followTopicById(followerB.id, topicMid.id),
      followTopicById(followerA.id, topicLow.id),
    ])

    await applyAndAwaitVoteStats(itemId, { plusLimit: 2, proLimit: 0 })

    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toHaveLength(2)
    expect(topicIds).toEqual(expect.arrayContaining([topicHigh.id, topicMid.id]))
    expect(topicIds).not.toContain(topicLow.id)
  })

  it('caps the pro pool at proLimit', async () => {
    const { feedId, itemId } = await setupItem()
    const topics = await Promise.all(Array.from({ length: 5 }, () => createTestTopic({})))
    const follower = await createPaidFollower(feedId, 'pro')
    await Promise.all(topics.map(topic => followTopicById(follower.id, topic.id)))

    await applyAndAwaitVoteStats(itemId, { plusLimit: 0, proLimit: 4 })

    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toHaveLength(4)
    expect(topics.filter(topic => topicIds.includes(topic.id))).toHaveLength(4)
  })

  it('adds collaborative support to an alias-tagged topic before selecting other candidates', async () => {
    const { feedId, itemId } = await setupItem()
    const alreadyTaggedTopic = await createTestTopic({})
    const alias = `collab-alias-${createRandomString(8)}`
    await createTopicAliases(alreadyTaggedTopic.id, [alias])
    await upsertRssFeedItemCategories([{ rss_feed_item_id: itemId, categories: [alias] }])

    const newTopic = await createTestTopic({})
    const follower = await createPaidFollower(feedId, 'plus')
    await Promise.all([
      followTopicById(follower.id, alreadyTaggedTopic.id),
      followTopicById(follower.id, newTopic.id),
    ])

    const relations = await applyAndAwaitVoteStats(itemId, { plusLimit: 1, proLimit: 0 })

    // The alias-derived relation is not collaborative support. The single plus slot must add the
    // collaborative vote to that topic, so unlinking the alias later leaves independent support.
    expect(relations).toEqual([expect.objectContaining({ object_id: alreadyTaggedTopic.id })])
    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toContain(alreadyTaggedTopic.id)
    expect(topicIds).not.toContain(newTopic.id)
  })

  it('excludes soft-deleted and merged-away topics', async () => {
    const { feedId, itemId } = await setupItem()
    const activeTopic = await createTestTopic({})
    const deletedTopic = await createTestTopic({})
    const mergedTopic = await createTestTopic({})
    const mergeTargetTopic = await createTestTopic({})

    const admin = await createTestUser({ administrator: true })
    await softDeleteTopic(deletedTopic.id, admin.id)
    await mergeTopicForTest(mergedTopic.id, mergeTargetTopic.id, admin.id)

    const follower = await createPaidFollower(feedId, 'plus')
    await Promise.all([
      followTopicById(follower.id, activeTopic.id),
      followTopicById(follower.id, deletedTopic.id),
      followTopicById(follower.id, mergedTopic.id),
    ])

    await applyAndAwaitVoteStats(itemId, { plusLimit: 5, proLimit: 0 })

    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toContain(activeTopic.id)
    expect(topicIds).not.toContain(deletedTopic.id)
    expect(topicIds).not.toContain(mergedTopic.id)
  })

  it('backfills the pro pool with pro-only topics instead of truncating on plus overlap', async () => {
    const { feedId, itemId } = await setupItem()
    const overlapTopics = await Promise.all(Array.from({ length: 3 }, () => createTestTopic({})))
    const proOnlyTopics = await Promise.all(Array.from({ length: 2 }, () => createTestTopic({})))

    const plusFollower = await createPaidFollower(feedId, 'plus')
    const proFollowerA = await createPaidFollower(feedId, 'pro')
    const proFollowerB = await createPaidFollower(feedId, 'pro')
    const proFollowerC = await createPaidFollower(feedId, 'pro')

    await Promise.all([
      // Each overlap topic is plus-followed once (fills the entire plusLimit-3 plus pool) and
      // pro-followed twice, so a naive pro query (without excluding the plus pool first) would
      // rank all three above the pro-only topics and truncate them out at LIMIT 4.
      ...overlapTopics.flatMap(topic => [
        followTopicById(plusFollower.id, topic.id),
        followTopicById(proFollowerA.id, topic.id),
        followTopicById(proFollowerB.id, topic.id),
      ]),
      ...proOnlyTopics.map(topic => followTopicById(proFollowerC.id, topic.id)),
    ])

    await applyAndAwaitVoteStats(itemId, { plusLimit: 3, proLimit: 4 })

    const topicIds = await getItemCategoryTopicIds(itemId)
    expect(topicIds).toHaveLength(5)
    expect(topicIds).toEqual(
      expect.arrayContaining([...overlapTopics, ...proOnlyTopics].map(topic => topic.id)),
    )
  })

  it('does not double-write a topic followed by both a plus and a pro follower', async () => {
    const { feedId, itemId } = await setupItem()
    const sharedTopic = await createTestTopic({})
    const plusFollower = await createPaidFollower(feedId, 'plus')
    const proFollower = await createPaidFollower(feedId, 'pro')
    await Promise.all([
      followTopicById(plusFollower.id, sharedTopic.id),
      followTopicById(proFollower.id, sharedTopic.id),
    ])

    const relations = await applyAndAwaitVoteStats(itemId, { plusLimit: 3, proLimit: 4 })
    // sharedTopic is excluded from the pro pool (it's already claimed by the plus pool), so only
    // one relation is written for it -- proving the pools don't double-write the same pair.
    expect(relations).toHaveLength(1)

    const item = await getRssFeedItemById(itemId)
    const matches = (item?.categories ?? []).filter(c => c.topic?.id === sharedTopic.id)
    expect(matches).toHaveLength(1)
  })
})
