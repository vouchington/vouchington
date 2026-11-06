import { encodeCursor } from '@modules/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  addRssFeedItemSource,
  createTestRssFeedItemWithUrl,
  createTestUser,
  disableTestRssFeed,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  insertTestStory,
  setRssFeedItemSourcePublishedAtForTest,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { setTestRssFeedDiscoverable } from '@voucha/test-helpers/entities/rss-feeds-discovery'
import { postsWorkConfig } from '@services/posts/work-limits'
import { softDeleteRssFeedById } from '@services/rss-feeds/delete'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'
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
      await setRssFeedItemSourcePublishedAtForTest(
        feed.id,
        newerItem.id,
        '2020-06-01T00:00:00.000000Z',
      )
      await setRssFeedItemSourcePublishedAtForTest(
        feed.id,
        olderItem.id,
        '2020-01-01T00:00:00.000000Z',
      )
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
    await setRssFeedItemSourcePublishedAtForTest(feed.id, item.id, null)
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

    await softDeleteRssFeedById(feed.id)
    const hidden = await getPostIds(undefined, {
      post_types: ['story'],
      time_range: 'all',
      limit: 10,
      after,
    })
    expect(hidden.results.map(result => result.id)).not.toContain(postId)
  })

  it('keeps disabled and non-discoverable feeds for moderation staff', async () => {
    const admin = await createTestUser({ administrator: true })
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const disabled = await insertVisibleStoryPost(user.id, 'disabled-feed-story')
    await disableTestRssFeed(disabled.feedId)
    const quiet = await insertVisibleStoryPost(user.id, 'quiet-feed-story')
    await setTestRssFeedDiscoverable(quiet.feedId, false)
    const removed = await insertVisibleStoryPost(user.id, 'staff-deleted-feed-story')
    await softDeleteRssFeedById(removed.feedId)

    for (const reader of [undefined, user]) {
      expect(await storyIds(reader, openPublishedCursor(disabled.feedId))).not.toContain(
        disabled.postId,
      )
      expect(await storyIds(reader, openPublishedCursor(quiet.feedId))).not.toContain(quiet.postId)
    }
    for (const reader of [admin, moderator]) {
      expect(await storyIds(reader, openPublishedCursor(disabled.feedId))).toContain(
        disabled.postId,
      )
      expect(await storyIds(reader, openPublishedCursor(quiet.feedId))).toContain(quiet.postId)
      expect(await storyIds(reader, openPublishedCursor(removed.feedId))).not.toContain(
        removed.postId,
      )
    }
  })

  it('returns a story post on at most one page when two feeds source it', async () => {
    const older = await insertTestRssFeedDirect({})
    const newer = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(newer.id)
    await addRssFeedItemSource(older.id, item.id)
    const story = await insertTestStory({ title: 'shared source story' })
    await setTestItemStoryId(item.id, story.id)
    const postId = await insertTestPost({
      title: 'Shared source story',
      slug: `shared-source-${crypto.randomUUID().slice(0, 8)}`,
      createdById: user.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(postId, story.id, user.id)
    const publishedAt = '2020-04-01T00:00:00.000000Z'
    await setRssFeedItemSourcePublishedAtForTest(newer.id, item.id, publishedAt)
    await setRssFeedItemSourcePublishedAtForTest(older.id, item.id, publishedAt)

    const seen: string[] = []
    let after: string | undefined = openPublishedCursor(newer.id)
    for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
      const page = await getPostIds(user, {
        post_types: ['story'],
        time_range: 'all',
        limit: 1,
        after,
      })
      seen.push(...page.results.map(result => result.id))
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }
    expect(seen[0]).toBe(postId)
    expect(seen.filter(id => id === postId)).toEqual([postId])
  })

  it('keeps a public story when a newer disabled feed also sources it', async () => {
    const admin = await createTestUser({ administrator: true })
    const visible = await insertVisibleStoryPost(user.id, 'public-owned-story')
    const disabled = await insertTestRssFeedDirect({})
    await disableTestRssFeed(disabled.id)
    await addRssFeedItemSource(disabled.id, visible.itemId)
    await setRssFeedItemSourcePublishedAtForTest(
      disabled.id,
      visible.itemId,
      '2020-05-01T00:00:00.000000Z',
    )

    expect(await storyIds(undefined, openPublishedCursor(visible.feedId))).toContain(visible.postId)
    expect(await storyIds(admin, openPublishedCursor(disabled.id))).toContain(visible.postId)
    expect(await storyIds(admin, openPublishedCursor(visible.feedId))).not.toContain(visible.postId)
  })
})

async function insertVisibleStoryPost(
  userId: string,
  slug: string,
): Promise<{ feedId: string; itemId: string; postId: string }> {
  const feed = await insertTestRssFeedDirect({})
  const item = await createTestRssFeedItemWithUrl(feed.id)
  const story = await insertTestStory({ title: slug })
  await setTestItemStoryId(item.id, story.id)
  const postId = await insertTestPost({
    title: slug,
    slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
    createdById: userId,
    markdown: '',
    postType: 'story',
  })
  await insertTestPostStory(postId, story.id, userId)
  await setRssFeedItemSourcePublishedAtForTest(feed.id, item.id, '2020-03-01T00:00:00.000000Z')
  return { feedId: feed.id, itemId: item.id, postId }
}

function openPublishedCursor(feedId: string): string {
  return encodeCursor({
    feed_id: feedId,
    feed_open: true,
    phase: 'published',
    item_id: MAX_ITEM_ID,
    published_at: OPEN_PUBLISHED_AT,
  })
}

async function storyIds(reader: PrivateUser | undefined, after: string): Promise<string[]> {
  const page = await getPostIds(reader, {
    post_types: ['story'],
    time_range: 'all',
    limit: 10,
    after,
  })
  return page.results.map(result => result.id)
}
