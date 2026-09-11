import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCrawlForTest,
  insertLanguageDetectionPostForTest,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import type { detectLanguageMany } from '../detector.mts'
import {
  detectPostLanguageBatch,
  detectRssFeedItemLanguageBatch,
  detectCrawlLanguageBatch,
} from '../batch-detect.mts'

const mockDetectLanguageMany = vi.fn<typeof detectLanguageMany>()

function makeBatchResult(iso6391: string) {
  return {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391, iso6393: `${iso6391}x`, confidence: 0.95 }],
  }
}

describe('batch-detect — posts, rss-feed-items, crawls', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── posts ───────────────────────────────────────────────────────────────

  describe('detectPostLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectPostBatch([])
      expect(result).toEqual({ updated: 0 })
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })

    it('detects language for posts and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Batch post ${random}`,
        markdown: 'Hello world English content for batch',
      })

      const result = await detectPostBatch([postId])
      expect(result.updated).toBe(1)

      const updated = await getLanguageDetectionStateForTest('posts', postId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips posts whose sha is already current (returns { updated: 0 })', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `SHA skip post ${random}`,
        markdown: 'Content to skip',
      })

      // First batch run sets the sha
      const first = await detectPostBatch([postId])
      expect(first.updated).toBe(1)
      vi.clearAllMocks()

      // Second batch run: sha matches, so no update
      const second = await detectPostBatch([postId])
      expect(second.updated).toBe(0)
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })

    it('handles a post with declared language (no lingua call)', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Declared batch post ${random}`,
        markdown: 'Bonjour le monde batch',
        declaredLanguage: 'fr',
      })

      const result = await detectPostBatch([postId])
      expect(result.updated).toBe(1)
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()

      expect(
        (await getLanguageDetectionStateForTest('posts', postId)).lingua_rs_detected_language,
      ).toBe('fr')
    })
  })

  // ─── crawls ───────────────────────────────────────────────────────────────

  describe('detectCrawlLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectCrawlBatch([])
      expect(result).toEqual({ updated: 0 })
    })

    it('detects language for crawls and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-batch-${random}.example.com`,
        url: `https://crawl-batch-${random}.example.com/page`,
        markdown: 'English crawl batch content',
      })

      const result = await detectCrawlBatch([crawlId])
      expect(result.updated).toBe(1)

      expect(
        (await getLanguageDetectionStateForTest('crawls', crawlId)).lingua_rs_detected_language,
      ).toBe('en')
    })
  })

  // ─── rss_feed_items ───────────────────────────────────────────────────────

  describe('detectRssFeedItemLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectRssFeedItemBatch([])
      expect(result).toEqual({ updated: 0 })
    })

    it('detects language for rss feed items and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Batch Feed ${random}` })
      const urlObj = await addUrl(null, `https://rss-batch-${random}.example.com/item`)
      const contentSha = Buffer.alloc(32, 0)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-batch-${random}`,
        itemData: {
          title: `Batch Item ${random}`,
          contentSnippet: '<p>&nbsp;</p>',
          'media:description': 'English batch media description',
        },
        contentSha256: contentSha,
      })

      const result = await detectRssFeedItemBatch([itemId])
      expect(result.updated).toBe(1)
      expect(mockDetectLanguageMany.mock.calls[0]![0]![0]!.toString()).toContain(
        'English batch media description',
      )

      expect(
        (await getLanguageDetectionStateForTest('rss_feed_items', itemId))
          .lingua_rs_detected_language,
      ).toBe('en')
    })
  })
})

function detectPostBatch(ids: string[]): Promise<{ updated: number }> {
  return detectPostLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}

function detectCrawlBatch(ids: string[]): Promise<{ updated: number }> {
  return detectCrawlLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}

function detectRssFeedItemBatch(ids: string[]): Promise<{ updated: number }> {
  return detectRssFeedItemLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}
