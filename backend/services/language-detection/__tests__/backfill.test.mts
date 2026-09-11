import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  createRandomString,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionCrawlForTest,
  insertLanguageDetectionPostForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionUserForTest,
  setRssFeedItemLanguageInputShaForTest,
  updateUserMarkdownForLanguageDetectionForTest,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import {
  streamPostsNeedingLanguageDetection,
  streamRssFeedItemsNeedingLanguageDetection,
  streamCrawlsNeedingLanguageDetection,
  streamCommunitiesNeedingLanguageDetection,
  streamUsersNeedingLanguageDetection,
  streamTopicsNeedingLanguageDetection,
} from '../backfill.mts'

async function drainStream(
  stream: AsyncGenerator<string[], void, unknown>,
): Promise<{ ids: Set<string>; batchSizes: number[] }> {
  const ids = new Set<string>()
  const batchSizes: number[] = []
  for await (const batch of stream) {
    expect(Array.isArray(batch)).toBe(true)
    batchSizes.push(batch.length)
    for (const id of batch) ids.add(id)
  }
  return { ids, batchSizes }
}

describe('language-detection backfill streams', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('streamPostsNeedingLanguageDetection', () => {
    it('includes non-deleted posts with null or stale lingua_rs_input_sha256', async () => {
      const random = createRandomString(10)

      const needsDetectionId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Post for backfill ${random}`,
        markdown: 'Content for backfill',
      })

      // Post with sha already set: included so runBatch can compare current content.
      const sha = Buffer.alloc(32, 1)
      const doneId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Post done ${random}`,
        markdown: 'Content done',
        inputSha256: sha,
      })

      const { ids, batchSizes } = await drainStream(streamPostsNeedingLanguageDetection())
      expect(ids.has(needsDetectionId)).toBe(true)
      expect(ids.has(doneId)).toBe(true)
      expect(batchSizes.every(n => n > 0 && n <= 500)).toBe(true)
    })

    it('excludes soft-deleted posts', async () => {
      const random = createRandomString(10)
      const deletedId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Deleted Post ${random}`,
        markdown: 'Content',
        deleted: true,
      })

      const { ids } = await drainStream(streamPostsNeedingLanguageDetection())
      expect(ids.has(deletedId)).toBe(false)
    })
  })

  describe('streamRssFeedItemsNeedingLanguageDetection', () => {
    it('includes non-deleted rss_feed_items with null or stale sha', async () => {
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed ${random}` })
      const urlObj = await addUrl(null, `https://rss-${random}.example.com/item1`)
      const contentSha = Buffer.alloc(32, 0)

      // Item needing detection
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-needs-${random}`,
        itemData: { title: `Item ${random}`, contentSnippet: 'Some content' },
        contentSha256: contentSha,
      })

      // Item with sha set (done)
      const urlObj2 = await addUrl(null, `https://rss-${random}.example.com/item2`)
      const itemDoneId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj2!.id,
        guid: `guid-done-${random}`,
        itemData: { title: `Done Item ${random}`, contentSnippet: 'Done content' },
        contentSha256: contentSha,
      })
      await setRssFeedItemLanguageInputShaForTest(itemDoneId, Buffer.alloc(32, 2))

      const { ids } = await drainStream(streamRssFeedItemsNeedingLanguageDetection())
      expect(ids.has(itemId)).toBe(true)
      expect(ids.has(itemDoneId)).toBe(true)
    })
  })

  describe('streamCrawlsNeedingLanguageDetection', () => {
    it('includes completed crawls with detector input and null or stale sha', async () => {
      const random = createRandomString(10)

      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-${random}.example.com`,
        url: `https://crawl-${random}.example.com/page`,
        markdown: 'Some crawl markdown content',
      })
      const titleOnlyId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-title-${random}.example.com`,
        url: `https://crawl-title-${random}.example.com/page`,
        markdown: '',
        title: 'Title-only crawl',
      })
      const langOnlyId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-lang-${random}.example.com`,
        url: `https://crawl-lang-${random}.example.com/page`,
        markdown: '',
        lang: 'fr',
      })
      const crawlDoneId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-done-${random}.example.com`,
        url: `https://crawl-done-${random}.example.com/page`,
        markdown: 'Done crawl content',
        inputSha256: Buffer.alloc(32, 3),
      })

      const { ids } = await drainStream(streamCrawlsNeedingLanguageDetection())
      expect(ids.has(crawlId)).toBe(true)
      expect(ids.has(titleOnlyId)).toBe(true)
      expect(ids.has(langOnlyId)).toBe(true)
      expect(ids.has(crawlDoneId)).toBe(true)
    })
  })

  describe('streamCommunitiesNeedingLanguageDetection', () => {
    it('includes non-deleted communities with null or stale sha', async () => {
      const random = createRandomString(10)

      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Lang Det Community ${random}`,
        slug: `lang-det-comm-${random}`,
      })

      // Community with sha set
      const doneCommunityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Done Community ${random}`,
        slug: `done-comm-${random}`,
        inputSha256: Buffer.alloc(32, 4),
      })

      const { ids } = await drainStream(streamCommunitiesNeedingLanguageDetection())
      expect(ids.has(communityId)).toBe(true)
      expect(ids.has(doneCommunityId)).toBe(true)
    })

    it('excludes soft-deleted communities', async () => {
      const random = createRandomString(10)
      const deletedId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Deleted Comm ${random}`,
        slug: `deleted-comm-${random}`,
        deleted: true,
      })

      const { ids } = await drainStream(streamCommunitiesNeedingLanguageDetection())
      expect(ids.has(deletedId)).toBe(false)
    })
  })

  describe('streamUsersNeedingLanguageDetection', () => {
    it('includes users with non-empty bio and null or stale sha; excludes empty bio', async () => {
      const random = createRandomString(10)

      // User with bio, no sha → needs detection
      const bioUserId = await updateUserMarkdownForLanguageDetectionForTest(
        user.id,
        'My bio for lang detection test',
      )

      // User with bio AND sha → done
      const doneUserId = await insertLanguageDetectionUserForTest({
        username: `user-done-${random}`,
        markdown: 'Bio that is done',
        inputSha256: Buffer.alloc(32, 5),
      })

      // User with no bio → excluded
      const noBioUserId = await insertLanguageDetectionUserForTest({
        username: `user-nobio-${random}`,
      })

      const { ids } = await drainStream(streamUsersNeedingLanguageDetection())
      expect(ids.has(bioUserId)).toBe(true)
      expect(ids.has(doneUserId)).toBe(true)
      expect(ids.has(noBioUserId)).toBe(false)
    })
  })

  describe('streamTopicsNeedingLanguageDetection', () => {
    it('includes topics with null or stale sha and excludes deleted or merged topics', async () => {
      const random = createRandomString(10)

      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Lang Det Topic ${random}`,
        slug: `lang-det-topic-${random}`,
      })

      // Topic with sha set → done
      const doneTopicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Done Topic ${random}`,
        slug: `done-topic-${random}`,
        inputSha256: Buffer.alloc(32, 6),
      })

      // Soft-deleted topic
      const deletedTopicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Deleted Topic ${random}`,
        slug: `deleted-topic-${random}`,
        deleted: true,
      })

      const { ids } = await drainStream(streamTopicsNeedingLanguageDetection())
      expect(ids.has(topicId)).toBe(true)
      expect(ids.has(doneTopicId)).toBe(true)
      expect(ids.has(deletedTopicId)).toBe(false)
    })
  })
})
