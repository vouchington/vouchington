import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  createTestRssFeedItemWithUrl,
  addCategoryToRssFeedItem,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { postPublicationQueue } from '../../queues/post-publication/queues.mts'
import { caches } from '@services/entity-cache/caches'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from '../../workers/post-publication/processors/direct-effects.mts'
import {
  listLiveItemSourceFeedsPage,
  listLiveTopicMergeItemsPage,
  listLiveTopicMergePostsPage,
} from '@services/post-publication/live-topic-merge-pages'
import { seedTopicMergeDirectPostCategory } from '@voucha/test-helpers/topic-merge-posts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('topic merge publication capture', () => {
  it('retains both topic projections for direct post categories and categories on independently owned RSS feeds', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceRow = await createTestTopic({ user: admin })
    const destinationRow = await createTestTopic({ user: admin })
    const source = await getTopicByAny(sourceRow.id)
    const destination = await getTopicByAny(destinationRow.id)
    if (!source || !destination) throw new Error('Test topics not found')
    const post = await createTestPost({ user: admin })
    await seedTopicMergeDirectPostCategory(post.id, source.id)
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    await addCategoryToRssFeedItem(item.id, source.id, `merge-${crypto.randomUUID()}`)
    const jobs = await captureAddedPublicationEffectsForScope(destination.id, () =>
      mergeTopicAliases(admin, source, destination),
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.scope).toEqual({ type: 'topic', id: destination.id })
    expect(jobs[0]?.keys).toEqual(
      expect.arrayContaining([
        { kind: 'impact_topic', uuidValue: source.id },
        { kind: 'impact_topic', uuidValue: destination.id },
      ]),
    )
    expect((await listLiveTopicMergePostsPage(destination.id, null)).ids).toContain(post.id)
    const directItems = await listLiveTopicMergeItemsPage(destination.id, null)
    expect(directItems.ids).toEqual([])
    expect(directItems.cursor).not.toBeNull()
    if (!directItems.cursor) throw new Error('Expected the bounded raw-category phase')
    expect((await listLiveTopicMergeItemsPage(destination.id, directItems.cursor)).ids).toContain(
      item.id,
    )
    expect((await listLiveItemSourceFeedsPage(item.id, null)).ids).toContain(feed.id)

    await Promise.all([
      caches.posts.set(post.id, 'stale post'),
      caches.rss_feeds.set(feed.id, 'stale feed'),
    ])
    const admitted: Array<{ id: string; data: PostPublicationEffectsJobData }> = []
    const onAdded = (job: { id: string; name: string; data: unknown }) => {
      const data = job.data as PostPublicationEffectsJobData
      if (job.name === POST_PUBLICATION_EFFECTS_JOB.name && data.scope?.id === destination.id)
        admitted.push({ id: job.id, data })
    }
    postPublicationQueue.on('added', onAdded)
    try {
      await processApplyPostPublicationEffects(jobs[0]!)
      for (let index = 0; index < admitted.length; index++) {
        if (index >= 128) throw new Error('Topic merge fixture exceeded its finite job graph')
        await processApplyPostPublicationEffects(admitted[index]!.data)
      }
      expect(admitted.map(job => job.data.continuation?.kind)).toEqual(
        expect.arrayContaining([
          'topic_merge_posts',
          'topic_merge_items',
          'topic_merge_item_sources',
        ]),
      )
      expect(await caches.posts.get(post.id)).toBeNull()
      expect(await caches.rss_feeds.get(feed.id)).toBeNull()
    } finally {
      postPublicationQueue.off('added', onAdded)
      await Promise.all(
        admitted.map(async job => (await postPublicationQueue.getJob(job.id))?.remove()),
      )
    }
  })
})
