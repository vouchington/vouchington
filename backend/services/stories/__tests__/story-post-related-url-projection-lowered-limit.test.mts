import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  createTestUrlWithHostname,
  getPostRelatedUrlIds,
  insertTestRssFeedItem,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertSystemUser } from '@services/users/system-users'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'

async function insertItem(storyId: string, feedId: string, urlId: string): Promise<string> {
  const suffix = randomUUID()
  const itemData = { title: suffix, link: `https://example.com/${suffix}` }
  const id = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: suffix,
    itemData,
    contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
  })
  await setTestItemStoryId(id, storyId)
  return id
}

describe('story projection with a lowered limit', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('replaces four old source URLs with two new ones after the cap drops to two', async () => {
    await relationLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
      post_related_url: 4,
    })
    onTestFinished(restore)
    const [user, feed, story, urls] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `Lowered cap ${randomUUID()}` }),
      Promise.all(Array.from({ length: 6 }, () => createTestUrlWithHostname())),
    ])
    const oldUrls = urls.slice(0, 4)
    const newUrls = urls.slice(4)
    const items = await Promise.all(oldUrls.map(urlId => insertItem(story.id, feed.id, urlId)))
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(oldUrls.toSorted())
    restore()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(oldUrls.toSorted())
    await Promise.all(items.map(id => setTestItemStoryId(id, null)))
    await Promise.all(newUrls.map(urlId => insertItem(story.id, feed.id, urlId)))
    await refreshStoryPostForStory(story.id)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(newUrls.toSorted())
  })

  it('keeps the two oldest projected URLs when the cap drops and the items stay', async () => {
    await relationLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(relationLimitsConfig, {
      post_related_url: 4,
    })
    onTestFinished(restore)
    const [user, feed, story] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `Lowered prefix ${randomUUID()}` }),
    ])
    const urls: string[] = []
    for (let index = 0; index < 4; index += 1) {
      const urlId = await createTestUrlWithHostname()
      urls.push(urlId)
      await insertItem(story.id, feed.id, urlId)
    }
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(urls.toSorted())
    restore()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(urls.toSorted())
    await refreshStoryPostForStory(story.id)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(urls.slice(0, 2).toSorted())
  })
})
