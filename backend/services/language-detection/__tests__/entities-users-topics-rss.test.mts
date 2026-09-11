import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionUserForTest,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import type { detectLanguage } from '../detector.mts'
import { detectUserLanguage } from '../entities/users.mts'
import { detectTopicLanguage } from '../entities/topics.mts'
import { detectRssFeedItemLanguage } from '../entities/rss-feed-items.mts'

const mockDetectLanguage = vi.fn<typeof detectLanguage>()

function makeLinguaResult(iso6391: string) {
  return {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391, iso6393: `${iso6391}x`, confidence: 0.95 }],
  }
}

describe('entity language detection — users, topics, rss-feed-items', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── users ────────────────────────────────────────────────────────────────

  describe('detectUserLanguage', () => {
    it('returns early without update when user not found', async () => {
      await detectUser('00000000-0000-7000-8000-000000000004')
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns for user with bio', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-entity-${random}`,
        markdown: 'Hello this is my English bio text',
      })

      await detectUser(userId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      const updated = await getLanguageDetectionStateForTest('users', userId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-idem-${random}`,
        markdown: 'Idempotent bio content',
      })

      await detectUser(userId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      await detectUser(userId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })
  })

  // ─── topics ───────────────────────────────────────────────────────────────

  describe('detectTopicLanguage', () => {
    it('returns early without update when topic not found', async () => {
      await detectTopic('00000000-0000-7000-8000-000000000005')
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns for topic without prior detection', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Topic entity test ${random}`,
        slug: `topic-entity-${random}`,
      })

      await detectTopic(topicId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      const updated = await getLanguageDetectionStateForTest('topics', topicId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Idempotent Topic ${random}`,
        slug: `idem-topic-${random}`,
      })

      await detectTopic(topicId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      await detectTopic(topicId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })
  })

  // ─── rss_feed_items ───────────────────────────────────────────────────────

  describe('detectRssFeedItemLanguage', () => {
    it('returns early without update when item not found', async () => {
      await detectRssFeedItem('00000000-0000-7000-8000-000000000006')
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns for rss feed item without prior detection', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed ${random}` })
      const urlObj = await addUrl(null, `https://rss-entity-${random}.example.com/item`)
      const contentSha = Buffer.alloc(32, 0)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-entity-${random}`,
        itemData: {
          title: `Item ${random}`,
          contentSnippet: '<p>&nbsp;</p>',
          'media:description': 'Hello world English media description',
        },
        contentSha256: contentSha,
      })

      await detectRssFeedItem(itemId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      expect(mockDetectLanguage.mock.calls[0]![0].toString()).toContain(
        'Hello world English media description',
      )
      const updated = await getLanguageDetectionStateForTest('rss_feed_items', itemId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed Idem ${random}` })
      const urlObj = await addUrl(null, `https://rss-idem-${random}.example.com/item`)
      const contentSha = Buffer.alloc(32, 0)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-idem-${random}`,
        itemData: { title: `Idem Item ${random}`, contentSnippet: 'Idempotent content' },
        contentSha256: contentSha,
      })

      await detectRssFeedItem(itemId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      await detectRssFeedItem(itemId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })
  })
})

function detectUser(userId: string): Promise<void> {
  return detectUserLanguage(userId, { detectLanguage: mockDetectLanguage })
}

function detectTopic(topicId: string): Promise<void> {
  return detectTopicLanguage(topicId, { detectLanguage: mockDetectLanguage })
}

function detectRssFeedItem(itemId: string): Promise<void> {
  return detectRssFeedItemLanguage(itemId, { detectLanguage: mockDetectLanguage })
}
