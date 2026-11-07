import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { storiesWorkConfig } from '@services/stories/work-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { createTestStoryProjectionLease } from '../../../test-helpers/entities/story-projection-work.mts'
import {
  drainStoryPostRelatedUrlProjection,
  processOwnedStoryProjectionPage,
} from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { writeStoryPostRelatedUrlProjectionRelations } from '../story-post-related-url-projection-relations.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from '../story-post-related-url-projection-source.mts'
import { releaseStoryPostRelatedUrlProjectionWork } from '../story-post-related-url-projection-work.mts'

describe('story projection safety change at capacity', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('replaces a newly blocked existing URL when an older source comes first at capacity one', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    await storiesWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(storiesWorkConfig, {
        post_related_url_projection_page_size: 1,
      }),
    )
    const suffix = crypto.randomUUID()
    const [user, feed, story, blocked, replacement] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `Ordered safety replacement ${suffix}` }),
      insertTestUrlDirect(null, `https://ordered-blocked-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://ordered-replacement-${suffix}.example.test/article`),
    ])
    if (!blocked || !replacement) throw new Error('Expected URL fixtures')
    const insertItem = async (urlId: string, label: string) => {
      const itemData = { title: label, link: `https://example.test/${suffix}/${label}` }
      return insertTestRssFeedItem({
        rssFeedId: feed.id,
        urlId,
        guid: `${label}-${suffix}`,
        itemData,
        contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
      })
    }
    const replacementItem = await insertItem(replacement.id, 'replacement')
    const blockedItem = await insertItem(blocked.id, 'blocked')
    const secondBlockedItem = await insertItem(blocked.id, 'blocked-second')
    expect(replacementItem.localeCompare(blockedItem)).toBeLessThan(0)
    await Promise.all([
      setTestItemStoryId(blockedItem, story.id),
      setTestItemStoryId(secondBlockedItem, story.id),
    ])
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect(await getPostRelatedUrlIds(post.id)).toEqual([blocked.id])

    await setTestItemStoryId(replacementItem, story.id)
    await refreshStoryPostForStory(story.id)
    for (let page = 0; page < 4; page++) {
      await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
        continue: true,
      })
    }
    const work = await createTestStoryProjectionLease(post.id)
    if (!work) throw new Error('Expected source-writing lease')
    try {
      expect(work.eligibility_completed_at).not.toBeNull()
      const source = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      expect(source.map(row => row.id)).toEqual([replacementItem])
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }
    await updateUrlHostnameBlocked(blocked.hostname.id, true)
    await expect(drainStoryPostRelatedUrlProjection(post.id)).resolves.toBeUndefined()
    expect(await getPostRelatedUrlIds(post.id)).toEqual([replacement.id])
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toEqual({
      processed: 0,
      continue: false,
    })
  })

  it('replaces an existing source blocked after eligibility staging without exceeding capacity', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    await storiesWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(storiesWorkConfig, {
        post_related_url_projection_page_size: 3,
      }),
    )
    const suffix = crypto.randomUUID()
    const [user, story, blocked, retained, replacement] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection safety replacement ${suffix}` }),
      insertTestUrlDirect(null, `https://safety-blocked-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://safety-retained-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://safety-replacement-${suffix}.example.test/article`),
    ])
    if (!blocked || !retained || !replacement) throw new Error('Expected URL fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: blocked.id, count: 1 })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: retained.id, count: 1 })
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: replacement.id, count: 1 })
    await refreshStoryPostForStory(story.id)
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 3,
      continue: true,
    })
    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 0,
      continue: true,
    })
    const work = await createTestStoryProjectionLease(post.id)
    if (!work) throw new Error('Expected source-writing lease')
    try {
      const rows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
      const decisions = await decideStoryPostRelatedUrlProjectionRows(work, rows)
      expect(decisions).toHaveLength(3)
      expect(decisions.every(row => row.is_eligible)).toBe(true)
      await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
      await updateUrlHostnameBlocked(blocked.hostname.id, true)
      await expect(writeStoryPostRelatedUrlProjectionRelations(work, decisions)).resolves.toBe(true)
      expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
        [retained.id, replacement.id].toSorted(),
      )
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }
    await drainStoryPostRelatedUrlProjection(post.id)
  })
})
