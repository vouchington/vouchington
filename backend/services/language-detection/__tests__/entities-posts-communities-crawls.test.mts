import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionCrawlForTest,
  insertLanguageDetectionPostForTest,
} from '@voucha/test-helpers'
import { getLanguageDetectionResultForTest } from '@voucha/test-helpers/sql-language-detection-state'
import type { PrivateUser } from '@services/users/types'
import { detectPostLanguage } from '../entities/posts.mts'
import { detectCommunityLanguage } from '../entities/communities.mts'
import { detectCrawlLanguage } from '../entities/crawls.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'

describe('entity language detection — posts, communities, crawls', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('detectPostLanguage', () => {
    it('returns early without update when post not found', async () => {
      await expect(detectPostLanguage('00000000-0000-7000-8000-000000000001')).resolves.toBe(
        undefined,
      )
    })

    it('detects the language and writes columns when post has no prior detection', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Post entity test ${random}`,
        markdown: ENGLISH,
      })

      await detectPostLanguage(postId)

      const updated = await getLanguageDetectionStateForTest('posts', postId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection (idempotency) when input sha is already current', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Idempotent Post ${random}`,
        markdown: GERMAN,
      })

      await detectPostLanguage(postId)
      const first = await getLanguageDetectionStateForTest('posts', postId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectPostLanguage(postId)
      expect(await getLanguageDetectionStateForTest('posts', postId)).toEqual(first)
    })

    it('uses declared language instead of detecting the text', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Declared Lang Post ${random}`,
        markdown: ENGLISH,
        declaredLanguage: 'fr',
      })

      await detectPostLanguage(postId)

      const result = await getLanguageDetectionResultForTest('posts', postId)
      expect(result.lingua_rs_detected_language).toBe('fr')
      expect(result.lingua_rs_results).toEqual({ source: 'declared', language: 'fr' })
    })
  })

  describe('detectCommunityLanguage', () => {
    it('returns early without update when community not found', async () => {
      await expect(detectCommunityLanguage('00000000-0000-7000-8000-000000000002')).resolves.toBe(
        undefined,
      )
    })

    it('detects the language and writes columns for community without prior detection', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `${ENGLISH} ${random}`,
        slug: `comm-entity-${random}`,
      })

      await detectCommunityLanguage(communityId)

      const updated = await getLanguageDetectionStateForTest('communities', communityId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when input sha is already current (idempotency)', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `${GERMAN} ${random}`,
        slug: `idempotent-comm-${random}`,
      })

      await detectCommunityLanguage(communityId)
      const first = await getLanguageDetectionStateForTest('communities', communityId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectCommunityLanguage(communityId)
      expect(await getLanguageDetectionStateForTest('communities', communityId)).toEqual(first)
    })

    it('uses declared language (default_language) instead of detecting the text', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `${ENGLISH} ${random}`,
        slug: `spanish-comm-${random}`,
        defaultLanguage: 'es',
      })

      await detectCommunityLanguage(communityId)

      const result = await getLanguageDetectionResultForTest('communities', communityId)
      expect(result.lingua_rs_detected_language).toBe('es')
      expect(result.lingua_rs_results).toEqual({ source: 'declared', language: 'es' })
    })
  })

  describe('detectCrawlLanguage', () => {
    it('returns early without update when crawl not found', async () => {
      await expect(detectCrawlLanguage('00000000-0000-7000-8000-000000000003')).resolves.toBe(
        undefined,
      )
    })

    it('detects the language and writes columns for crawl without prior detection', async () => {
      const random = createRandomString(10)
      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-entity-${random}.example.com`,
        url: `https://crawl-entity-${random}.example.com/page`,
        markdown: ENGLISH,
      })

      await detectCrawlLanguage(crawlId)

      const updated = await getLanguageDetectionStateForTest('crawls', crawlId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).toHaveLength(32)
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      const random = createRandomString(10)
      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-idem-${random}.example.com`,
        url: `https://crawl-idem-${random}.example.com/page`,
        markdown: GERMAN,
      })

      await detectCrawlLanguage(crawlId)
      const first = await getLanguageDetectionStateForTest('crawls', crawlId)
      expect(first.lingua_rs_detected_language).toBe('de')

      await detectCrawlLanguage(crawlId)
      expect(await getLanguageDetectionStateForTest('crawls', crawlId)).toEqual(first)
    })
  })
})
