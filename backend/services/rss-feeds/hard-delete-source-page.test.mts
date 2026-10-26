import { describe, expect, it, onTestFinished } from 'vitest'
import { read } from '@data-stores/psql'
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
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { createRssFeed } from './create.mts'
import { hardDeleteRssFeedById } from './delete.mts'
import { hardDeleteRssFeedSourcePage } from './hard-delete-source-page.mts'

describe('resumable RSS feed source removal', () => {
  it('captures each committed page while preserving shared story posts', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 2,
    })
    onTestFinished(restore)
    const user = await createTestUser()
    const nonce = createRandomString(10)
    const topic = await createTestTopic({
      user,
      hostname: `rss-delete-page-${nonce}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-delete-page-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Resumable RSS feed deletion',
    })
    const url = await insertTestUrlDirect(user.id, `https://example.com/rss-delete-${nonce}`)
    if (!url) throw new Error('Expected RSS item URL')
    const { postIds } = await insertTestStoryCategoryPublicationBatch({
      count: 3,
      categoryText: `rss-delete-${nonce}`,
      createdById: user.id,
      rssFeedId: feed.id,
      topicId: topic.id,
      urlId: url.id,
    })
    onTestFinished(() => hardDeleteTestPosts(postIds))

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    const first = await hardDeleteRssFeedSourcePage(feed.id)
    expect(first.removed).toBe(2)
    expect(first.hasMore).toBe(true)
    expect(first.keys).toContainEqual({ kind: 'identity_rss_feed', uuidValue: feed.id })
    expect(first.keys.filter(key => key.kind === 'impact_post')).toHaveLength(2)
    const second = await hardDeleteRssFeedSourcePage(feed.id)
    expect(second.removed).toBe(1)
    expect(second.hasMore).toBe(false)
    expect(second.keys.filter(key => key.kind === 'impact_post')).toHaveLength(1)

    const [{ rows: remainingSources }, { rows: survivingPosts }, { rows: pendingCategories }] =
      await Promise.all([
        read<{ count: number }>(
          `/* hardDeleteRssFeedSourcePageTest:sources */
          SELECT COUNT(*)::integer AS count FROM rss_feed_item_sources WHERE rss_feed_id = $1`,
          [feed.id],
        ),
        read<{ count: number }>(
          `/* hardDeleteRssFeedSourcePageTest:posts */
          SELECT COUNT(*)::integer AS count FROM posts WHERE id = ANY($1::uuid[])`,
          [postIds],
        ),
        read<{ count: number }>(
          `/* hardDeleteRssFeedSourcePageTest:categories */
          SELECT COUNT(*)::integer AS count
          FROM rss_feed_item_category_snapshot_reconciliations reconciliation
          JOIN rss_feed_items item ON item.id = reconciliation.rss_feed_item_id
          JOIN story_posts story_post ON story_post.story_id = item.story_id
          WHERE story_post.post_id = ANY($1::uuid[])`,
          [postIds],
        ),
      ])
    expect(remainingSources[0]?.count).toBe(0)
    expect(survivingPosts[0]?.count).toBe(3)
    expect(pendingCategories[0]?.count).toBe(3)
  })
})
