import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestRssFeedDirect,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'

let testUser: PrivateUser

const projectionDependencies = {
  dispatchStoryPostRelationEffects: async () => {},
  enqueueOnPostCreated: () => {},
  enqueueStoryPostAgent: async () => {},
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
  invalidateStories: async () => {},
}

describe('story post RSS URL revisions', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
    testUser = await createTestUserDirect()
  })

  it('reconciles an assigned item URL revision onto its story post', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const story = await insertTestStory({ title: `RSS URL revision ${suffix}` })
    const revisionInput = {
      guid: `rss-url-revision-${suffix}`,
      link: `https://rss-url-revision-${suffix}.example.com/original`,
      title: 'Revised RSS item',
    }
    const companionInput = {
      guid: `rss-url-companion-${suffix}`,
      link: `https://rss-url-companion-${suffix}.example.com/article`,
      title: 'Companion RSS item',
    }
    const [revisionItem, companionItem] = await upsertRssFeedItems(feed.id, [
      revisionInput,
      companionInput,
    ])
    await Promise.all([
      setTestItemStoryId(revisionItem.id, story.id),
      setTestItemStoryId(companionItem.id, story.id),
    ])
    const { post } = await createStoryPost(story.id, testUser, {}, projectionDependencies)
    await drainProjection(post.id)

    const original = await getRssFeedItemById(revisionItem.id)
    const companion = await getRssFeedItemById(companionItem.id)
    expect(original).toBeDefined()
    expect(companion).toBeDefined()
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual(
      expect.arrayContaining([original!.url.id, companion!.url.id]),
    )

    await upsertRssFeedItems(feed.id, [
      { ...revisionInput, link: `https://rss-url-revision-${suffix}.example.com/corrected` },
    ])
    const revised = await getRssFeedItemById(revisionItem.id)
    expect(revised).toBeDefined()
    expect(revised!.url.id).not.toBe(original!.url.id)

    await drainProjection(post.id)
    const projectedUrlIds = await getPostRelatedUrlIds(post.id)
    expect(projectedUrlIds).toEqual(expect.arrayContaining([revised!.url.id, companion!.url.id]))
    expect(projectedUrlIds).not.toContain(original!.url.id)
  })

  it('keeps a related URL re-confirmed before an RSS URL revision', async () => {
    const suffix = crypto.randomUUID()
    const feed = await insertTestRssFeedDirect({})
    const story = await insertTestStory({ title: `RSS URL confirmation ${suffix}` })
    const revisionInput = {
      guid: `rss-url-confirm-${suffix}`,
      link: `https://rss-url-confirm-${suffix}.example.com/original`,
      title: 'Confirmed RSS item',
    }
    const companionInput = {
      guid: `rss-url-confirm-companion-${suffix}`,
      link: `https://rss-url-confirm-companion-${suffix}.example.com/article`,
      title: 'Companion RSS item',
    }
    const [revisionItem, companionItem] = await upsertRssFeedItems(feed.id, [
      revisionInput,
      companionInput,
    ])
    await Promise.all([
      setTestItemStoryId(revisionItem.id, story.id),
      setTestItemStoryId(companionItem.id, story.id),
    ])
    const { post } = await createStoryPost(story.id, testUser, {}, projectionDependencies)
    await drainProjection(post.id)
    const original = await getRssFeedItemById(revisionItem.id)
    const companion = await getRssFeedItemById(companionItem.id)
    expect(original).toBeDefined()
    expect(companion).toBeDefined()
    await refreshStoryPostForStory(story.id)
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'url',
      predicate: 'related',
    })
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: original!.url.id }])

    await upsertRssFeedItems(feed.id, [
      { ...revisionInput, link: `https://rss-url-confirm-${suffix}.example.com/corrected` },
    ])
    const revised = await getRssFeedItemById(revisionItem.id)
    expect(revised).toBeDefined()
    await drainProjection(post.id)

    const projectedUrlIds = await getPostRelatedUrlIds(post.id)
    expect(projectedUrlIds).toEqual(
      expect.arrayContaining([original!.url.id, revised!.url.id, companion!.url.id]),
    )
  })
})

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
