import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import type { AutotaggerRssFeedItemJobData } from '@queues/ai-agents/types'
import { autotaggerPaidLimitsConfig } from '@services/autotagger'
import {
  createTestMembership,
  createTestTopic,
  createTestUser,
  followTopicById,
  getRssFeedItemCategoryTopicRelationDeletedAt,
  insertEntityRelation,
} from '@voucha/test-helpers'
import { createAutotaggerFeedItemFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processAutotaggerRssFeedItem } from './process-autotagger.mts'

const jobFor = (rssFeedItemId: string) =>
  ({ data: { rss_feed_item_id: rssFeedItemId } }) as Job<AutotaggerRssFeedItemJobData>

/** A feed item whose two paid followers follow one shared topic and one topic of their own. */
async function itemWithPaidFollowers() {
  const { feedId, itemId } = await createAutotaggerFeedItemFixture()
  const [shared, own, first, second] = await Promise.all([
    createTestTopic({}),
    createTestTopic({}),
    createTestUser(),
    createTestUser(),
  ])
  await Promise.all(
    [first, second].flatMap(user => [
      createTestMembership({ user_id: user.id, plan: 'plus' }),
      insertEntityRelation('relation__user__follow__rss_feed', user.id, feedId),
    ]),
  )
  await Promise.all([
    followTopicById(first.id, shared.id),
    followTopicById(second.id, shared.id),
    followTopicById(first.id, own.id),
  ])
  return { itemId, shared, own }
}

const isTagged = async (itemId: string, topicId: string) =>
  (await getRssFeedItemCategoryTopicRelationDeletedAt(itemId, topicId)) === null

describe('collaborative-follower pass for an RSS feed item (real PG)', () => {
  it('tags the most followed topics up to the configured plus cap, with no model call', async () => {
    const { itemId, shared, own } = await itemWithPaidFollowers()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_collaborative_plus_max_topics: 1,
      rss_collaborative_pro_max_topics: 1,
    })

    try {
      await expect(processAutotaggerRssFeedItem(jobFor(itemId))).resolves.toBeNull()
    } finally {
      restore()
    }

    expect(await isTagged(itemId, shared.id)).toBe(true)
    expect(await isTagged(itemId, own.id)).toBe(false)
  })

  it('tags every followed topic once the configured cap allows it', async () => {
    const { itemId, shared, own } = await itemWithPaidFollowers()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      rss_collaborative_plus_max_topics: 6,
    })

    try {
      await expect(processAutotaggerRssFeedItem(jobFor(itemId))).resolves.toBeNull()
    } finally {
      restore()
    }

    expect(await isTagged(itemId, shared.id)).toBe(true)
    expect(await isTagged(itemId, own.id)).toBe(true)
  })

  it('does nothing while the autotagger kill switch is off', async () => {
    const { itemId, shared, own } = await itemWithPaidFollowers()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      enabled: false,
    })

    try {
      await expect(processAutotaggerRssFeedItem(jobFor(itemId))).resolves.toBeNull()
    } finally {
      restore()
    }

    expect(await isTagged(itemId, shared.id)).toBe(false)
    expect(await isTagged(itemId, own.id)).toBe(false)
  })

  it('does nothing for a feed item that no longer exists', async () => {
    await expect(processAutotaggerRssFeedItem(jobFor(randomUUID()))).resolves.toBeNull()
  })
})
