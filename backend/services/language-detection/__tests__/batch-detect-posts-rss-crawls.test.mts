import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
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
import { getLanguageDetectionResultForTest } from '@voucha/test-helpers/sql-language-detection-state'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import {
  detectPostLanguageBatch,
  detectRssFeedItemLanguageBatch,
  detectCrawlLanguageBatch,
} from '../batch-detect.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'

describe('batch-detect — posts, rss-feed-items, crawls', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('detectPostLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectPostLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language for posts and writes results', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Batch post ${random}`,
        markdown: ENGLISH,
      })

      expect(await detectPostLanguageBatch([postId])).toEqual({ updated: 1 })

      const updated = await getLanguageDetectionStateForTest('posts', postId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips posts whose sha is already current (returns { updated: 0 })', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `SHA skip post ${random}`,
        markdown: GERMAN,
      })

      expect(await detectPostLanguageBatch([postId])).toEqual({ updated: 1 })
      const first = await getLanguageDetectionStateForTest('posts', postId)
      expect(first.lingua_rs_detected_language).toBe('de')

      expect(await detectPostLanguageBatch([postId])).toEqual({ updated: 0 })
      expect(await getLanguageDetectionStateForTest('posts', postId)).toEqual(first)
    })

    it('uses the declared language instead of detecting the text', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Declared batch post ${random}`,
        markdown: ENGLISH,
        declaredLanguage: 'es',
      })

      expect(await detectPostLanguageBatch([postId])).toEqual({ updated: 1 })

      const result = await getLanguageDetectionResultForTest('posts', postId)
      expect(result.lingua_rs_detected_language).toBe('es')
      expect(result.lingua_rs_results).toEqual({ source: 'declared', language: 'es' })
    })
  })

  describe('detectCrawlLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectCrawlLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language for crawls and writes results', async () => {
      const random = createRandomString(10)
      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-batch-${random}.example.com`,
        url: `https://crawl-batch-${random}.example.com/page`,
        markdown: ENGLISH,
      })

      expect(await detectCrawlLanguageBatch([crawlId])).toEqual({ updated: 1 })

      expect(
        (await getLanguageDetectionStateForTest('crawls', crawlId)).lingua_rs_detected_language,
      ).toBe('en')
    })
  })

  describe('detectRssFeedItemLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectRssFeedItemLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language from the first visible rss text field and writes results', async () => {
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Batch Feed ${random}` })
      const urlObj = await addUrl(null, `https://rss-batch-${random}.example.com/item`)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-batch-${random}`,
        itemData: {
          title: `Batch Item ${random}`,
          contentSnippet: '<p>&nbsp;</p>',
          'media:description': GERMAN,
        },
        contentSha256: Buffer.alloc(32, 0),
      })

      expect(await detectRssFeedItemLanguageBatch([itemId])).toEqual({ updated: 1 })

      const result = await getLanguageDetectionResultForTest('rss_feed_items', itemId)
      expect(result.lingua_rs_detected_language).toBe('de')
      expect(result.lingua_rs_content_sha256).toEqual(
        createHash('sha256').update(`Batch Item ${random}\n\n${GERMAN}`, 'utf8').digest(),
      )
    })
  })
})
