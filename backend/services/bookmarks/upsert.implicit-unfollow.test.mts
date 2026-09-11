import { it, expect, describe } from 'vitest'
import { bookmarkEntity } from './upsert.mts'
import { getBookmarksForEntity } from './get.mts'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertTestCommunity,
} from '@voucha/test-helpers'

// Each test uses a fresh user to avoid bloom filter backfill races between tests
// that run in parallel with the rest of the bookmarks test suite.

describe('Implicit unfollow on mute/block', () => {
  it('muting a topic removes an existing topic follow', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Implicit Unfollow Topic ${random}`,
      slug: `implicit-unfollow-topic-${random}`,
      createdById: user.id,
    })

    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    const before = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(before.follow).toBe(true)

    await bookmarkEntity(user, 'topic', { id: topicId }, 'mute')

    const after = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(after.follow).toBeUndefined()
    expect(after.mute).toBe(true)
  })

  it('blocking a topic removes an existing topic follow', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Block Topic ${random}`,
      slug: `block-topic-${random}`,
      createdById: user.id,
    })

    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    const before = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(before.follow).toBe(true)

    await bookmarkEntity(user, 'topic', { id: topicId }, 'block')

    const after = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(after.follow).toBeUndefined()
    expect(after.block).toBe(true)
  })

  it('muting a user does NOT remove an existing user follow', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()

    await bookmarkEntity(user, 'user', { id: otherUser.id }, 'follow')
    const before = await getBookmarksForEntity(user, 'user', { id: otherUser.id })
    expect(before.follow).toBe(true)

    await bookmarkEntity(user, 'user', { id: otherUser.id }, 'mute')

    const after = await getBookmarksForEntity(user, 'user', { id: otherUser.id })
    expect(after.follow).toBe(true)
    expect(after.mute).toBe(true)
  })

  it('blocking a user removes an existing user follow', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()

    await bookmarkEntity(user, 'user', { id: otherUser.id }, 'follow')
    const before = await getBookmarksForEntity(user, 'user', { id: otherUser.id })
    expect(before.follow).toBe(true)

    await bookmarkEntity(user, 'user', { id: otherUser.id }, 'block')

    const after = await getBookmarksForEntity(user, 'user', { id: otherUser.id })
    expect(after.follow).toBeUndefined()
    expect(after.block).toBe(true)
  })

  it('muting an RSS feed removes an existing RSS feed follow', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `RSS Mute Topic ${random}`,
      slug: `rss-mute-topic-${random}`,
      createdById: user.id,
    })
    const rssFeedId = await insertTestRssFeed({
      topicId,
      title: `RSS Mute Feed ${random}`,
    })

    await bookmarkEntity(user, 'rss_feed', { id: rssFeedId }, 'follow')
    const before = await getBookmarksForEntity(user, 'rss_feed', { id: rssFeedId })
    expect(before.follow).toBe(true)

    await bookmarkEntity(user, 'rss_feed', { id: rssFeedId }, 'mute')

    const after = await getBookmarksForEntity(user, 'rss_feed', { id: rssFeedId })
    expect(after.follow).toBeUndefined()
    expect(after.mute).toBe(true)
  })

  it('proxy-muting a community removes an existing community proxy-follow', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const community = await insertTestCommunity({
      name: `Proxy Mute Community ${random}`,
      slug: `proxy-mute-community-${random}`,
      createdById: user.id,
    })

    await bookmarkEntity(user, 'community', { id: community.id }, 'proxy_follow')
    const before = await getBookmarksForEntity(user, 'community', { id: community.id })
    expect(before.proxy_follow).toBe(true)

    await bookmarkEntity(user, 'community', { id: community.id }, 'proxy_mute')

    const after = await getBookmarksForEntity(user, 'community', { id: community.id })
    expect(after.proxy_follow).toBeUndefined()
    expect(after.proxy_mute).toBe(true)
  })

  it('muting a topic without a prior follow is a no-op (no error)', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `No Prior Follow Topic ${random}`,
      slug: `no-prior-follow-topic-${random}`,
      createdById: user.id,
    })

    await expect(bookmarkEntity(user, 'topic', { id: topicId }, 'mute')).resolves.toBeDefined()

    const after = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(after.mute).toBe(true)
    expect(after.follow).toBeUndefined()
  })

  it('muting a topic twice is idempotent (no error)', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Idempotent Mute Topic ${random}`,
      slug: `idempotent-mute-topic-${random}`,
      createdById: user.id,
    })

    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await bookmarkEntity(user, 'topic', { id: topicId }, 'mute')
    await expect(bookmarkEntity(user, 'topic', { id: topicId }, 'mute')).resolves.toBeDefined()

    const after = await getBookmarksForEntity(user, 'topic', { id: topicId })
    expect(after.follow).toBeUndefined()
    expect(after.mute).toBe(true)
  })
})
