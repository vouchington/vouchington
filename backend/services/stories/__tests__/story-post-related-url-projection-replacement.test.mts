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
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertSystemUser } from '@services/users/system-users'
import { readStoryProjectionWorkForTest } from '../../../test-helpers/entities/story-projection-work.mts'
import { drainStoryPostRelatedUrlProjection } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'

async function insertItem(storyId: string, feedId: string, urlId: string): Promise<string> {
  const suffix = randomUUID()
  const itemData = { title: `Replacement ${suffix}`, link: `https://example.com/${suffix}` }
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid: `projection-replacement-${suffix}`,
    itemData,
    contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
  })
  await setTestItemStoryId(itemId, storyId)
  return itemId
}

describe('story projection replacement at capacity', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
  })

  it('replaces an obsolete projection URL with a new source when the final set fits', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    const [user, feed, story, first, retained, replacement] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `Replacement ${randomUUID()}` }),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const firstItem = await insertItem(story.id, feed.id, first)
    await insertItem(story.id, feed.id, retained)
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual([first, retained].toSorted())

    await setTestItemStoryId(firstItem, null)
    await insertItem(story.id, feed.id, replacement)
    await refreshStoryPostForStory(story.id)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
      [retained, replacement].toSorted(),
    )
  })

  it('keeps a manual URL and admits only the older source that still fits', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(relationLimitsConfig, { post_related_url: 2 }),
    )
    const [user, feed, story, first, manual, replacement, excess] = await Promise.all([
      createTestUserDirect(),
      createTestRssFeed({}),
      insertTestStory({ title: `Replacement rollback ${randomUUID()}` }),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const firstItem = await insertItem(story.id, feed.id, first)
    const secondFirstItem = await insertItem(story.id, feed.id, first)
    const {
      response: { post },
    } = await prepareStoryPost(story.id, user)
    await drainStoryPostRelatedUrlProjection(post.id)
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(user, relation, { id: post.id }, [{ id: manual }])
    await setTestItemStoryId(firstItem, null)
    await setTestItemStoryId(secondFirstItem, null)
    await insertItem(story.id, feed.id, replacement)
    await insertItem(story.id, feed.id, excess)
    await refreshStoryPostForStory(story.id)
    await upsertEntityRelation(user, relation, { id: post.id }, [{ id: manual }])
    await expect(drainStoryPostRelatedUrlProjection(post.id)).resolves.toBeUndefined()
    expect((await getPostRelatedUrlIds(post.id)).toSorted()).toEqual(
      [manual, replacement].toSorted(),
    )
    expect(await readStoryProjectionWorkForTest([post.id])).toEqual([])
  })
})
