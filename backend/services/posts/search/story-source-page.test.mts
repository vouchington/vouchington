import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { postsWorkConfig } from '@services/posts/work-limits'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { getPostIds } from './get-ids.mts'

const MAX_ITEM_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const OPEN_PUBLISHED_AT = '9999-12-31T23:59:59.999999Z'

describe('story source pages', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('resumes the same feed before reading an older feed', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      story_source_child_limit: 1,
    })
    try {
      const feed = await insertTestRssFeedDirect({})
      const newerItem = await createTestRssFeedItemWithUrl(feed.id)
      const olderItem = await createTestRssFeedItemWithUrl(feed.id)
      await setSourcePublishedAt(newerItem.id, '2020-06-01T00:00:00.000000Z')
      await setSourcePublishedAt(olderItem.id, '2020-01-01T00:00:00.000000Z')
      const newerStory = await insertTestStory({ title: 'newer story page' })
      const olderStory = await insertTestStory({ title: 'older story page' })
      await setTestItemStoryId(newerItem.id, newerStory.id)
      await setTestItemStoryId(olderItem.id, olderStory.id)
      const newerPostId = await insertTestPost({
        title: 'Newer story post',
        slug: `newer-story-${crypto.randomUUID().slice(0, 8)}`,
        createdById: user.id,
        markdown: '',
        postType: 'story',
      })
      const olderPostId = await insertTestPost({
        title: 'Older story post',
        slug: `older-story-${crypto.randomUUID().slice(0, 8)}`,
        createdById: user.id,
        markdown: '',
        postType: 'story',
      })
      await insertTestPostStory(newerPostId, newerStory.id, user.id)
      await insertTestPostStory(olderPostId, olderStory.id, user.id)

      const first = await getPostIds(user, {
        post_types: ['story'],
        time_range: 'all',
        limit: 10,
        after: encodeCursor({
          feed_id: feed.id,
          feed_open: true,
          phase: 'published',
          item_id: MAX_ITEM_ID,
          published_at: OPEN_PUBLISHED_AT,
        }),
      })
      expect(first.results.map(result => result.id)).toEqual([newerPostId])
      expect(first.page_info.has_next_page).toBe(true)

      const second = await getPostIds(user, {
        post_types: ['story'],
        time_range: 'all',
        limit: 10,
        after: first.page_info.end_cursor ?? undefined,
      })
      expect(second.results[0]?.id).toBe(olderPostId)
      expect(second.results.map(result => result.id)).not.toContain(newerPostId)
    } finally {
      restore()
    }
  })

  it('skips a story whose feed was deleted', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)
    const story = await insertTestStory({ title: 'deleted feed story' })
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Deleted feed story',
      slug: `deleted-feed-story-${crypto.randomUUID().slice(0, 8)}`,
      createdById: user.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(postId, story.id, user.id)
    await setSourcePublishedAt(item.id, null)
    const after = encodeCursor({
      feed_id: feed.id,
      feed_open: true,
      phase: 'missing',
      item_id: MAX_ITEM_ID,
      published_at: null,
    })
    const visible = await getPostIds(undefined, {
      post_types: ['story'],
      time_range: 'all',
      limit: 10,
      after,
    })
    expect(visible.results.map(result => result.id)).toContain(postId)

    await write(sql`/* storySourcePageTest */
      UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${feed.id}
    `)
    const hidden = await getPostIds(undefined, {
      post_types: ['story'],
      time_range: 'all',
      limit: 10,
      after,
    })
    expect(hidden.results.map(result => result.id)).not.toContain(postId)
  })
})

async function setSourcePublishedAt(itemId: string, publishedAt: string | null): Promise<void> {
  // rss_feed_items.published_at is generated. Story pages order the source association.
  await write(sql`/* storySourcePageTest */
    UPDATE rss_feed_item_sources
    SET published_at = ${publishedAt}::timestamptz
    WHERE rss_feed_item_id = ${itemId}
  `)
}
