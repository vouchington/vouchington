import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createRandomString,
  createTestTopic,
  createTestUser,
  hardDeleteTestPosts,
  insertTestStoryCategoryPublicationBatch,
  insertTestUrlDirect,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRssFeed } from '@services/rss-feeds/create'
import { hardDeleteRssFeedById } from '@services/rss-feeds/delete'
import { hardDeleteRssFeedChildPage } from '@services/rss-feeds/hard-delete-child-page'
import { RSS_FEED_HARD_DELETE_CHILD_PHASES } from '@queues/rss-feed-maintenance/types'
import { processRecoverRssFeedHardDeletes } from '@services/rss-feeds/hard-delete-recovery'
import {
  getPostPublicationWorkLimit,
  postPublicationWorkConfig,
} from '../../../services/post-publication/work-limits.mts'
import {
  readTestRssFeedDeleteMarker,
  deleteTestRssFeedRow,
} from '../../../test-helpers/rss-hard-delete-queries.mts'
import { countTestFeedSources } from '../../../test-helpers/publication-test-queries.mts'
import {
  insertTestRssFeedCategory,
  getTestRssFeedCategories,
} from '../../../test-helpers/entities/rss-feed-categories.mts'
import {
  processHardDeleteRssFeedSourcePage,
  processHardDeleteRssFeedChildPage,
  processFinalizeHardDeleteRssFeed,
} from './hard-delete.mts'

async function createMarkedFeed(label: string, mark = true) {
  const nonce = createRandomString(10)
  const topic = await createTestTopic({ hostname: `${label}-${nonce}.example.com` })
  const feed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    skipRemoteValidation: true,
    rss_feed_url: `https://${label}-${nonce}.example.com/feed.xml`,
    topic_id: topic.id,
    title: `Resumable ${label}`,
  })
  onTestFinished(() => deleteTestRssFeedRow(feed.id))
  if (mark && !(await hardDeleteRssFeedById(feed.id)))
    throw new Error(`Expected hard deletion to start for ${feed.id}`)
  return feed
}

describe('RSS feed deletion job chain', () => {
  it('recovers a committed delete marker and advances empty source and child pages', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 1,
    })
    onTestFinished(restore)
    const feed = await createMarkedFeed('recover-feed')
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeInstanceOf(Date)
    expect(getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')).toBeGreaterThan(
      0,
    )
    const recovery = await processRecoverRssFeedHardDeletes({ afterId: null })
    expect(recovery.admitted).toBe(1)

    await processHardDeleteRssFeedSourcePage({ rssFeedId: feed.id })
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'setting_changes' })
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'setting_changes' })
    expect(await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')).toEqual({
      removed: 0,
      hasMore: false,
    })
    for (const phase of RSS_FEED_HARD_DELETE_CHILD_PHASES)
      await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase })
    await processFinalizeHardDeleteRssFeed({ rssFeedId: feed.id })
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeNull()
    await processFinalizeHardDeleteRssFeed({ rssFeedId: feed.id })
  })

  it('continues a bounded history phase before advancing the next phase', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 1,
    })
    onTestFinished(restore)
    const feed = await createMarkedFeed('bounded-feed')
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'setting_changes' })
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'setting_changes' })
    expect(await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')).toEqual({
      removed: 0,
      hasMore: false,
    })
  })

  it('retries a finalizer reached early and drains source edges in separate commits', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 1,
    })
    onTestFinished(restore)
    const user = await createTestUser()
    const feed = await createMarkedFeed('source-resume', false)
    const url = await insertTestUrlDirect(
      user.id,
      `https://source-resume-${createRandomString(10)}.example.com/story`,
    )
    if (!url) throw new Error('Expected story URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 2,
      categoryText: `source-resume-${createRandomString(10)}`,
      createdById: user.id,
      rssFeedId: feed.id,
      topicId: feed.topic_id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))
    expect(await countTestFeedSources(feed.id)).toBe(2)
    expect(await hardDeleteRssFeedById(feed.id)).toBe(true)

    await processFinalizeHardDeleteRssFeed({ rssFeedId: feed.id })
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeInstanceOf(Date)
    await processHardDeleteRssFeedSourcePage({ rssFeedId: feed.id })
    expect(await countTestFeedSources(feed.id)).toBe(1)
    await processHardDeleteRssFeedSourcePage({ rssFeedId: feed.id })
    expect(await countTestFeedSources(feed.id)).toBe(0)
    await processFinalizeHardDeleteRssFeed({ rssFeedId: feed.id })
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeInstanceOf(Date)
  })

  it('continues a feed category phase until every old topic reference is captured', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 1,
    })
    onTestFinished(restore)
    const feed = await createMarkedFeed('category-resume', false)
    const topic = await createTestTopic({
      hostname: `category-resume-${createRandomString(10)}.example.com`,
    })
    const nonce = createRandomString(10)
    await insertTestRssFeedCategory(feed.id, `category-a-${nonce}`, topic.id)
    await insertTestRssFeedCategory(feed.id, `category-b-${nonce}`, topic.id)
    expect(await hardDeleteRssFeedById(feed.id)).toBe(true)

    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'feed_categories' })
    expect(await getTestRssFeedCategories(feed.id)).toHaveLength(1)
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'feed_categories' })
    expect(await getTestRssFeedCategories(feed.id)).toEqual([])
    await processHardDeleteRssFeedChildPage({ rssFeedId: feed.id, phase: 'feed_categories' })
  })
})
