import { it, expect, beforeAll, describe, vi } from 'vitest'
import { createRssFeed } from '../create.mts'
import { updateRssFeedById } from '../update.mts'
import {
  updateRssFeedByIdAsCurrentUser,
  updateRssFeedWithStateAsCurrentUser,
} from '../update-current-user.mts'
import { getRssFeedById } from '../get.mts'
import { getLatestDiscoverabilityChange, getLatestEnablementChange } from '../discoverability.mts'
import {
  beginTransaction,
  createTestTopic,
  createTestUser,
  getRssFeedCrawlById,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createHash, randomUUID } from 'node:crypto'
import { insertRssFeedCrawl } from '../crawls.mts'
import * as publicationLock from '@services/post-publication/lock'
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
    const enablement = await getLatestEnablementChange(feed.id)
    const discoverability = await getLatestDiscoverabilityChange(feed.id)
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
  it('updateRssFeedByIdAsCurrentUser attributes state changes to current user', async () => {
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
    await updateRssFeedByIdAsCurrentUser(sharedUser, feed.id, {
      is_enabled: false,
      discoverable: false,
    })
    const enablement = await getLatestEnablementChange(feed.id)
    const discoverability = await getLatestDiscoverabilityChange(feed.id)
    expect(enablement!.changed_by_id).toBe(sharedUser.id)
    expect(discoverability!.changed_by_id).toBe(sharedUser.id)
  })
  it('updateRssFeedByIdAsCurrentUser returns null for state-only changes on missing feed', async () => {
    const result = await updateRssFeedByIdAsCurrentUser(sharedUser, randomUUID(), {
      discoverable: false,
    })
    expect(result).toBeNull()
  })
  it('updateRssFeedWithStateAsCurrentUser ignores state-only changes on missing feed', async () => {
    await expect(
      updateRssFeedWithStateAsCurrentUser(sharedUser, randomUUID(), {}, { discoverable: false }),
    ).resolves.toBeUndefined()
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
  it('insertRssFeedCrawl records crawl with response_code and feed_data', async () => {
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
    const crawlId = await insertRssFeedCrawl({
      rss_feed_id: feed.id,
      response_code: 200,
      feed_data: feedData,
      feed_data_sha256: feedDataSha256,
    })
    expect(crawlId).toBeDefined()
    const crawl = await getRssFeedCrawlById(crawlId)
    expect(crawl).toBeDefined()
    expect(crawl!.response_code).toBe(200)
    expect(crawl!.feed_data).toEqual(feedData)
    expect(Buffer.isBuffer(crawl!.feed_data_sha256)).toBe(true)
    expect(crawl!.feed_data_sha256?.equals(feedDataSha256)).toBe(true)
  })
  async function whileFeedRowHeld(
    feedId: string,
    entered: Promise<void>,
    start: () => Promise<unknown>,
    probe: () => Promise<void>,
    restore: () => void,
  ): Promise<unknown> {
    const locked = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holder = (async () => {
      await using query = await beginTransaction()
      await query(`SELECT 1 FROM rss_feeds WHERE id = $1::uuid FOR UPDATE`, [feedId])
      locked.resolve()
      await release.promise
      await query.commit()
    })()
    await locked.promise
    const pending = start()
    let probeError: unknown
    try {
      await entered
      await probe()
    } catch (err) {
      probeError = err
    } finally {
      release.resolve()
      restore()
    }
    await holder
    await pending
    return probeError
  }
  it('takes the publication lock before waiting on the feed row', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: sharedUser,
      hostname: `publication-lock-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/feed-${random}.xml`,
      topic_id: topic.id,
      title: `Publication lock ${random}`,
    })
    const lockScope = publicationLock.lockPostPublicationScope
    const scopeHeld = Promise.withResolvers<void>()
    const scopeSpy = vi
      .spyOn(publicationLock, 'lockPostPublicationScope')
      .mockImplementation(async (query, scope) => {
        await lockScope(query, scope)
        scopeHeld.resolve()
      })
    await expect(
      whileFeedRowHeld(
        feed.id,
        scopeHeld.promise,
        () => updateRssFeedById(feed.id, { title: `Updated ${random}` }),
        async () => {
          await using query = await beginTransaction()
          await query(`SET LOCAL lock_timeout = '50ms'`)
          await lockScope(query, { type: 'rss_feed', rssFeedId: feed.id })
          await query.commit()
        },
        () => scopeSpy.mockRestore(),
      ),
    ).resolves.toMatchObject({ code: '55P03' })
  })
  it('takes the destination attachment lifecycle before waiting on the feed row', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const source = await createTestTopic({
      user: sharedUser,
      hostname: `attachment-source-${random}.example.com`,
    })
    const destination = await createTestTopic({
      user: sharedUser,
      hostname: `attachment-destination-${random}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://example.com/attachment-${random}.xml`,
      topic_id: source.id,
      title: `Attachment lifecycle ${random}`,
    })
    const lockAttachment = publicationLock.lockTopicRssFeedAttachmentLifecycle
    const attachmentHeld = Promise.withResolvers<void>()
    const attachmentSpy = vi
      .spyOn(publicationLock, 'lockTopicRssFeedAttachmentLifecycle')
      .mockImplementation(async (query, topicId) => {
        await lockAttachment(query, topicId)
        attachmentHeld.resolve()
      })
    await expect(
      whileFeedRowHeld(
        feed.id,
        attachmentHeld.promise,
        () => updateRssFeedById(feed.id, { topic_id: destination.id }),
        async () => {
          await using query = await beginTransaction()
          await query(`SET LOCAL lock_timeout = '50ms'`)
          await lockAttachment(query, destination.id)
          await query.commit()
        },
        () => attachmentSpy.mockRestore(),
      ),
    ).resolves.toMatchObject({ code: '55P03' })
  })
})
