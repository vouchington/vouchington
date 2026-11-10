import { it, expect, beforeAll, describe } from 'vitest'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import { updateRssFeedWithStateAsCurrentUser } from '../update-current-user.mts'
import { getRssFeedById } from '../get.mts'
import {
  createTestTopic,
  createTestUser,
  getRssFeedCrawlById,
  getLatestTestRssFeedStateChange,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createHash, randomUUID } from 'node:crypto'
import { persistRssFeedCrawlAndMetadata, searchRssFeedCrawls } from '../crawls.mts'
describe('update.generated (state)', () => {
  let sharedUser: PrivateUser
  beforeAll(async () => {
    sharedUser = await createTestUser({ administrator: true })
  })
  it('updateRssFeedById enables feed', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `enable-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true })
    const updated = await getRssFeedById(feed.id)
    expect(updated!.is_enabled).toBe(true)
  })
  it('updateRssFeedById records a caller-provided system state change reason', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `system-state-reason-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(
      feed.id,
      { is_enabled: false, discoverable: false },
      { stateChangeReason: 'test: focused state reason' },
    )
    const enablement = await getLatestTestRssFeedStateChange('enablement', feed.id)
    const discoverability = await getLatestTestRssFeedStateChange('discoverability', feed.id)
    expect(enablement!.reason).toBe('test: focused state reason')
    expect(discoverability!.reason).toBe('test: focused state reason')
  })
  it('updateRssFeedById disables feed', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `disable-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { is_enabled: true })
    await updateRssFeedById(feed.id, { is_enabled: false })
    const updated = await getRssFeedById(feed.id)
    expect(updated!.is_enabled).toBe(false)
  })
  it('updateRssFeedWithStateAsCurrentUser attributes state changes to current user', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `user-state-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedWithStateAsCurrentUser(
      sharedUser,
      feed.id,
      {},
      {
        is_enabled: false,
        discoverable: false,
        reason: 'test: current user state update',
      },
    )
    const enablement = await getLatestTestRssFeedStateChange('enablement', feed.id)
    const discoverability = await getLatestTestRssFeedStateChange('discoverability', feed.id)
    expect(enablement!.changed_by_id).toBe(sharedUser.id)
    expect(discoverability!.changed_by_id).toBe(sharedUser.id)
    expect(enablement!.reason).toBe('test: current user state update')
    expect(discoverability!.reason).toBe('test: current user state update')
  })
  it('updateRssFeedWithStateAsCurrentUser ignores state-only changes on missing feed', async () => {
    await expect(
      updateRssFeedWithStateAsCurrentUser(sharedUser, randomUUID(), {}, { discoverable: false }),
    ).resolves.toBeNull()
  })

  it('updateRssFeedById hides feed when discoverable = false', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `hide-feed-${random}.example.com`,
    })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { discoverable: false })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.is_discoverable).toBe(false)
  })

  it('updateRssFeedById shows feed when discoverable = true', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `show-feed-${random}.example.com`,
    })

    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    await updateRssFeedById(feed.id, { discoverable: false })
    await updateRssFeedById(feed.id, { discoverable: true })

    const updated = await getRssFeedById(feed.id)
    expect(updated!.is_discoverable).toBe(true)
  })
  it('persists crawl response and feed data with metadata', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `crawl-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Test Feed ${random}`,
    })
    const feedData = { title: 'Parsed Feed', items: [{ link: 'https://e.com/1', guid: 'g1' }] }
    const feedDataSha256 = createHash('sha256').update(JSON.stringify(feedData), 'utf8').digest()
    await persistRssFeedCrawlAndMetadata({
      rssFeedId: feed.id,
      responseCode: 200,
      feedData: feedData,
      feedDataSha256: feedDataSha256,
      headers: { etag: null, lastModified: null },
    })
    const crawlId = (await searchRssFeedCrawls(feed.id, { limit: 1 })).results[0]!.id
    const crawl = await getRssFeedCrawlById(crawlId)
    expect(crawl).toBeDefined()
    expect(crawl!.response_code).toBe(200)
    expect(crawl!.feed_data).toEqual(feedData)
    expect(Buffer.isBuffer(crawl!.feed_data_sha256)).toBe(true)
    expect(crawl!.feed_data_sha256?.equals(feedDataSha256)).toBe(true)
  })
})
