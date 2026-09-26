import { it, expect, beforeAll, describe } from 'vitest'
import { createTestRssFeed } from '../test-fixtures.mts'
import { updateRssFeedById } from '../update.mts'
import { updateRssFeedByIdAsCurrentUser } from '../update-current-user.mts'
import { getRssFeedById } from '../get.mts'
import {
  createTestTopic,
  createTestUser,
  getTestPostPublicationDirtyWorkForScope,
  getRssFeedDeclaredLanguageForTest,
  listTestPostPublicationImpactTopicIds,
  setRssFeedDeclaredLanguageForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('update.generated (fields)', () => {
  let sharedUser: PrivateUser

  beforeAll(async () => {
    sharedUser = await createTestUser({ administrator: true })
  })

  it('updateRssFeedById updates title', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `update-title-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Original Title ${random}`,
    })
    await updateRssFeedById(feed.id, { title: `Updated Title ${random}` })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.title).toBe(`Updated Title ${random}`)
  })

  it('updateRssFeedById updates rss_feed_url', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `update-url-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    // The fixture returns the raw table row, so rss_feed_url_id is available directly
    const oldUrlId = feed.rss_feed_url_id
    await updateRssFeedById(feed.id, { rss_feed_url: `https://example.com/new-feed-${random}.xml` })

    const updated = await getRssFeedById(feed.id)
    // getRssFeedById returns view, so rss_feed_url is a nested object
    expect(updated!.rss_feed_url.id).not.toBe(oldUrlId)
  })

  it('updateRssFeedById throws error for rss_feed_url fragments', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `update-url-fragment-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })

    await expect(
      updateRssFeedById(feed.id, { rss_feed_url: `https://example.com/new-feed-${random}.xml#s` }),
    ).rejects.toThrow('rss_feed_url must be a public http(s) URL without a fragment')
  })

  it('updateRssFeedById throws error for non-public rss_feed_url hostnames', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `update-url-private-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })

    await expect(
      updateRssFeedById(feed.id, { rss_feed_url: 'https://localhost/feed.xml' }),
    ).rejects.toThrow('rss_feed_url must be a public http(s) URL without a fragment')
  })

  it('updateRssFeedById updates topic by topic_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTestTopic({
      user: sharedUser,
      hostname: `topic-switch-old-${random}.example.com`,
    })
    const topic2 = await createTestTopic({
      user: sharedUser,
      hostname: `topic-switch-new-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic1.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { topic_id: topic2.id })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.topic.id).toBe(topic2.id)
    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'rss_feed', id: feed.id })
    expect(work?.reasons).toContain('rss_feed_discoverability_changed')
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toEqual(
      [topic1.id, topic2.id].toSorted(),
    )
  })

  it('updateRssFeedById updates etag', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `etag-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { etag: '"test-etag"' })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.etag).toBe('"test-etag"')
  })

  it('updateRssFeedById sets etag to null', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `etag-null-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { etag: '"test-etag"' })
    await updateRssFeedById(feed.id, { etag: null })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.etag).toBeNull()
  })

  it('updateRssFeedById updates last_modified_at with Date', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `modified-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    const testDate = new Date('2025-01-01T00:00:00Z')
    await updateRssFeedById(feed.id, { last_modified_at: testDate })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.last_modified_at).toBeInstanceOf(Date)
  })

  it('updateRssFeedById updates last_fetched_at with true', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `fetched-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { last_fetched_at: true })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.last_fetched_at).toBeInstanceOf(Date)
  })

  it('updateRssFeedById ignores declared_language when it is undefined', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `declared-language-undefined-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await setRssFeedDeclaredLanguageForTest(feed.id, 'fr')

    const result = await updateRssFeedById(feed.id, { declared_language: undefined })

    expect(result).toBeNull()
    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBe('fr')
  })

  it('updateRssFeedById updates declared_language to a language code', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `declared-language-set-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })

    await updateRssFeedById(feed.id, { declared_language: 'fr' })

    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBe('fr')
  })

  it('updateRssFeedById clears declared_language', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `declared-language-clear-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    await setRssFeedDeclaredLanguageForTest(feed.id, 'fr')

    await updateRssFeedById(feed.id, { declared_language: null })

    expect(await getRssFeedDeclaredLanguageForTest(feed.id)).toBeNull()
  })

  it('updateRssFeedById returns undefined when no changes provided', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `nochanges-${random}.example.com`,
    })

    const feed = await createTestRssFeed({
      rssFeedUrl: `https://example.com/feed-${random}.xml`,
      topicId: topic.id,
      title: `Test Feed ${random}`,
    })
    const result = await updateRssFeedById(feed.id, {})
    expect(result).toBeNull()
  })

  it('updateRssFeedByIdAsCurrentUser returns null when no row is updated', async () => {
    const result = await updateRssFeedByIdAsCurrentUser(sharedUser, randomUUID(), {
      title: 'Missing feed',
    })
    expect(result).toBeNull()
  })

  it('updateRssFeedById returns null for state-only changes on missing feed', async () => {
    const result = await updateRssFeedById(randomUUID(), { discoverable: false })
    expect(result).toBeNull()
  })
})
