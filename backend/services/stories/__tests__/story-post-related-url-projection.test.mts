import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  getTestStoryPostRelatedUrlDeletedById,
  getTestStoryPostProjectionReceiptCount,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { getSystemUserByUsername, upsertSystemUser } from '@services/users/system-users'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import type { PrivateUser } from '@services/users/types'
import { prepareStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { processOwnedStoryProjectionPage } from '../../../test-helpers/services/stories/story-post-related-url-projection.mts'

let testUser: PrivateUser

describe('story post related URL projection', () => {
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
    testUser = await createTestUserDirect()
  })

  it('admits one eligible prefix and drops its receipts when the generation finishes', async () => {
    const itemCount = 3
    const story = await insertTestStory({ title: `Projection scale ${crypto.randomUUID()}` })
    const url = await insertTestUrlDirect(
      null,
      `https://story-projection-scale-${crypto.randomUUID()}.example.test/article`,
    )
    expect(url).toBeDefined()
    await insertTestStoryRssFeedItemsBatch({
      storyId: story.id,
      urlId: url!.id,
      count: itemCount,
    })
    const prepared = await prepareStoryPost(story.id, testUser)
    const { post } = prepared.response

    const first = await processOwnedStoryProjectionPage(post.id)
    expect(first).toMatchObject({ processed: itemCount, continue: true })
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(1)

    await drainProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([url!.id])
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(0)
  })

  it('keeps a generation at its captured high-water until a later refresh', async () => {
    const story = await insertTestStory({ title: `Projection high-water ${crypto.randomUUID()}` })
    const [initialUrl, laterUrl] = await Promise.all([
      insertTestUrlDirect(
        null,
        `https://story-projection-initial-${crypto.randomUUID()}.example.test/article`,
      ),
      insertTestUrlDirect(
        null,
        `https://story-projection-later-${crypto.randomUUID()}.example.test/article`,
      ),
    ])
    expect(initialUrl).toBeDefined()
    expect(laterUrl).toBeDefined()
    await insertTestStoryRssFeedItemsBatch({
      storyId: story.id,
      urlId: initialUrl!.id,
      count: 2,
    })
    const prepared = await prepareStoryPost(story.id, testUser)
    const { post } = prepared.response
    await insertTestStoryRssFeedItemsBatch({
      storyId: story.id,
      urlId: laterUrl!.id,
      count: 1,
    })

    await drainProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([initialUrl!.id])

    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)
    const projectedUrlIds = await getPostRelatedUrlIds(post.id)
    expect(projectedUrlIds).toHaveLength(2)
    expect(projectedUrlIds).toEqual(expect.arrayContaining([initialUrl!.id, laterUrl!.id]))
  })

  it('preserves a related URL reactivated after a refresh captures its prune snapshot', async () => {
    const story = await insertTestStory({
      title: `Projection relation capture ${crypto.randomUUID()}`,
    })
    const [firstUrl, secondUrl, manualUrl] = await Promise.all([
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-first-${crypto.randomUUID()}`,
      ),
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-second-${crypto.randomUUID()}`,
      ),
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-manual-${crypto.randomUUID()}`,
      ),
    ])
    if (!firstUrl || !secondUrl || !manualUrl) throw new Error('Expected projection capture URLs')
    await Promise.all([
      insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: firstUrl.id, count: 2 }),
      insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: secondUrl.id, count: 2 }),
    ])
    const prepared = await prepareStoryPost(story.id, testUser)
    const { post } = prepared.response
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await softDeleteEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await drainProjection(post.id)

    await refreshStoryPostForStory(story.id)
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await drainProjection(post.id)

    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual(
      expect.arrayContaining([firstUrl.id, secondUrl.id, manualUrl.id]),
    )
  })

  it('defers stale-generation receipt cleanup to bounded worker reconciliation', async () => {
    const { post, story } = await createProjectablePost('stale-receipts')

    await expect(processOwnedStoryProjectionPage(post.id)).resolves.toMatchObject({
      processed: 2,
      continue: true,
    })
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(1)

    await refreshStoryPostForStory(story.id)
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(1)

    await drainProjection(post.id)
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(0)
  })

  it('attributes a pruned projection to story-teller and keeps a hand-added URL', async () => {
    const suffix = randomUUID()
    const [feed, story, sourceUrl, manualUrl] = await Promise.all([
      createTestRssFeed({}),
      insertTestStory({ title: `Projection prune ${suffix}` }),
      insertTestUrlDirect(null, `https://story-projection-source-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-projection-manual-${suffix}.example.test/article`),
    ])
    if (!sourceUrl || !manualUrl) throw new Error('Expected projection URLs')
    const itemData = { title: suffix, link: `https://example.com/${suffix}` }
    const companionData = {
      title: `${suffix}-companion`,
      link: `https://example.com/${suffix}-companion`,
    }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: sourceUrl.id,
      guid: suffix,
      itemData,
      contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
    })
    const companionId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: sourceUrl.id,
      guid: `${suffix}-companion`,
      itemData: companionData,
      contentSha256: createHash('sha256').update(JSON.stringify(companionData)).digest(),
    })
    await setTestItemStoryId(itemId, story.id)
    await setTestItemStoryId(companionId, story.id)
    const prepared = await prepareStoryPost(story.id, testUser)
    const { post } = prepared.response
    await drainProjection(post.id)
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await setTestItemStoryId(itemId, null)
    await setTestItemStoryId(companionId, null)
    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)

    const storyTeller = await getSystemUserByUsername('story-teller')
    if (!storyTeller) throw new Error('Expected story-teller system user')
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([manualUrl.id])
    await expect(getTestStoryPostRelatedUrlDeletedById(post.id, sourceUrl.id)).resolves.toBe(
      storyTeller.id,
    )
    await expect(getTestStoryPostRelatedUrlDeletedById(post.id, manualUrl.id)).resolves.toBeNull()
  })
})

async function createProjectablePost(label: string) {
  const story = await insertTestStory({
    title: `Projection dispatcher ${label} ${crypto.randomUUID()}`,
  })
  const url = await insertTestUrlDirect(
    null,
    `https://story-${crypto.randomUUID()}.example.test/${label}/article`,
  )
  if (!url) throw new Error('Expected a public projection test URL')
  await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
  const prepared = await prepareStoryPost(story.id, testUser)
  const { post } = prepared.response
  return { post, story }
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await processOwnedStoryProjectionPage(postId)
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
