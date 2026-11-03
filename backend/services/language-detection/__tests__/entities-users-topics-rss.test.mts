import { createHash, randomInt } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
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
import { getLanguageDetectionResultForTest } from '@voucha/test-helpers/sql-language-detection-state'
import { addUrl } from '@services/urls'
import type { PrivateUser } from '@services/users/types'
import { detectUserLanguage } from '../entities/users.mts'
import { detectTopicLanguage } from '../entities/topics.mts'
import { detectRssFeedItemLanguage } from '../entities/rss-feed-items.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'

// Topic names are unique case-insensitively, so they need a per-run suffix. Digits only: the detector
// ignores digits, while letters in a random suffix flip the detected language about 1% of the time.
const randomDigits = () => String(randomInt(1_000_000_000, 10_000_000_000))

describe('entity language detection — users, topics, rss-feed-items', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('detectUserLanguage', () => {
    it('returns early without update when user not found', async () => {
      await expect(detectUserLanguage('00000000-0000-7000-8000-000000000004')).resolves.toBe(
        undefined,
      )
    })

    it('detects the language and writes columns for user with bio', async () => {
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-entity-${random}`,
        markdown: ENGLISH,
      })

      await detectUserLanguage(userId)

      const updated = await getLanguageDetectionStateForTest('users', userId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-idem-${random}`,
        markdown: GERMAN,
      })

      await detectUserLanguage(userId)
      const first = await getLanguageDetectionStateForTest('users', userId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectUserLanguage(userId)
      expect(await getLanguageDetectionStateForTest('users', userId)).toEqual(first)
    })
  })

  describe('detectTopicLanguage', () => {
    it('returns early without update when topic not found', async () => {
      await expect(detectTopicLanguage('00000000-0000-7000-8000-000000000005')).resolves.toBe(
        undefined,
      )
    })

    it('detects the language and writes columns for topic without prior detection', async () => {
      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `${ENGLISH} ${randomDigits()}`,
        slug: `topic-entity-${random}`,
      })

      await detectTopicLanguage(topicId)

      const updated = await getLanguageDetectionStateForTest('topics', topicId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `${GERMAN} ${randomDigits()}`,
        slug: `idem-topic-${random}`,
      })

      await detectTopicLanguage(topicId)
      const first = await getLanguageDetectionStateForTest('topics', topicId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectTopicLanguage(topicId)
      expect(await getLanguageDetectionStateForTest('topics', topicId)).toEqual(first)
    })
  })

  describe('detectRssFeedItemLanguage', () => {
    it('returns early without update when item not found', async () => {
      await expect(detectRssFeedItemLanguage('00000000-0000-7000-8000-000000000006')).resolves.toBe(
        undefined,
      )
    })

    it('detects language from the first visible rss text field and writes columns', async () => {
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed ${random}` })
      const urlObj = await addUrl(null, `https://rss-entity-${random}.example.com/item`)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-entity-${random}`,
        itemData: {
          title: 'Item',
          contentSnippet: '<p>&nbsp;</p>',
          'media:description': GERMAN,
        },
        contentSha256: Buffer.alloc(32, 0),
      })

      await detectRssFeedItemLanguage(itemId)

      const updated = await getLanguageDetectionResultForTest('rss_feed_items', itemId)
      expect(updated.lingua_rs_detected_language).toBe('de')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
      expect(updated.lingua_rs_content_sha256).toEqual(
        createHash('sha256').update(`Item\n\n${GERMAN}`, 'utf8').digest(),
      )
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      const random = createRandomString(10)
      const topic = await createTestTopic()
      const feedId = await insertTestRssFeed({ topicId: topic.id, title: `Feed Idem ${random}` })
      const urlObj = await addUrl(null, `https://rss-idem-${random}.example.com/item`)

      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-idem-${random}`,
        itemData: { title: 'Idem Item', contentSnippet: GERMAN },
        contentSha256: Buffer.alloc(32, 0),
      })

      await detectRssFeedItemLanguage(itemId)
      const first = await getLanguageDetectionStateForTest('rss_feed_items', itemId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectRssFeedItemLanguage(itemId)
      expect(await getLanguageDetectionStateForTest('rss_feed_items', itemId)).toEqual(first)
    })
  })
})
