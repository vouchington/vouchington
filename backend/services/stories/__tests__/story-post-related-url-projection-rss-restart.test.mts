import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestRssFeedDirect,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { storiesWorkConfig } from '@services/stories/work-limits'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { upsertSystemUser } from '@services/users/system-users'
import { createTestStoryProjectionLease } from '../../../test-helpers/entities/story-projection-work.mts'
import {
  drainStoryPostRelatedUrlProjection,
  processOwnedStoryProjectionPage,
} from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-work.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'

describe('RSS projection generation restart', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('restarts eligibility before writes and retains the source on a later page', async () => {
    await Promise.all([
      relationLimitsConfig.waitForInitialization(),
      storiesWorkConfig.waitForInitialization(),
    ])
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(storiesWorkConfig, {
        post_related_url_projection_page_size: 1,
      }),
    )
    const suffix = crypto.randomUUID()
    const [user, feed, story] = await Promise.all([
      createTestUserDirect(),
      insertTestRssFeedDirect({}),
      insertTestStory({ title: `RSS restart ${suffix}` }),
    ])
    const first = {
      guid: `rss-first-${suffix}`,
      link: `https://rss-first-${suffix}.example.com/original`,
      title: 'First',
    }
    const second = {
      guid: `rss-second-${suffix}`,
      link: `https://rss-second-${suffix}.example.com/item`,
      title: 'Second',
    }
    const [firstItem, secondItem] = await upsertRssFeedItems(feed.id, [first, second])
    await setTestItemStoryId(firstItem.id, story.id)
    await setTestItemStoryId(secondItem.id, story.id)
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    const initialUrls = (await getPostRelatedUrlIds(post.id)).toSorted()
    await refreshStoryPostForStory(story.id)
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 1,
      continue: true,
    })
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 1,
      continue: true,
    })
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 0,
      continue: true,
    })
    const before = await createTestStoryProjectionLease(post.id)
    if (!before) throw new Error('Expected projection work')
    try {
      expect(before.eligibility_completed_at).not.toBeNull()
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(before)
    }
    await upsertRssFeedItems(feed.id, [
      { ...first, link: `https://rss-first-${suffix}.example.com/revised` },
    ])
    const restarted = await createTestStoryProjectionLease(post.id)
    if (!restarted) throw new Error('Expected restarted projection work')
    try {
      expect(BigInt(restarted.generation)).toBeGreaterThan(BigInt(before.generation))
      expect(restarted.eligibility_completed_at).toBeNull()
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(restarted)
    }
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 1,
      continue: true,
    })
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(initialUrls)
    await drainStoryPostRelatedUrlProjection(post.id)
    const [revised, companion] = await Promise.all([
      getRssFeedItemById(firstItem.id),
      getRssFeedItemById(secondItem.id),
    ])
    if (!revised || !companion) throw new Error('Expected RSS items')
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
      [revised.url.id, companion.url.id].toSorted(),
    )
  })
})
