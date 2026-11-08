import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestUrlDirect,
  updateUrlHostnameBlocked,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'

describe('story projection safety change at capacity', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('removes a blocked oldest URL and does not admit a newer item outside the prefix', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 1 }),
    )
    const suffix = crypto.randomUUID()
    const [user, feed, story, oldest, newer] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `No refill ${suffix}` }),
      insertTestUrlDirect(null, `https://no-refill-oldest-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://no-refill-newer-${suffix}.example.test/article`),
    ])
    if (!oldest || !newer) throw new Error('Expected URL fixtures')
    const oldestItem = await insertItem(feed.id, oldest.id, `oldest-${suffix}`)
    const newerItem = await insertItem(feed.id, newer.id, `newer-${suffix}`)
    expect(oldestItem.localeCompare(newerItem)).toBeLessThan(0)
    await setTestItemStoryId(oldestItem, story.id)
    await setTestItemStoryId(newerItem, story.id)
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect(await getPostRelatedUrlIds(post.id)).toEqual([oldest.id])

    await updateUrlHostnameBlocked(oldest.hostname.id, true)
    await refreshStoryPostForStory(story.id)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect(await getPostRelatedUrlIds(post.id)).toEqual([])
  })
})

async function insertItem(feedId: string, urlId: string, label: string): Promise<string> {
  const itemData = { title: label, link: `https://example.test/${label}` }
  return insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: label,
    itemData,
    contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
  })
}
