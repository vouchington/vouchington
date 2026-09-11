import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import {
  createTestUser,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionCrawlForTest,
  insertLanguageDetectionPostForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { detectLanguage } from '../detector.mts'
import { detectPostLanguage } from '../entities/posts.mts'
import { detectCommunityLanguage } from '../entities/communities.mts'
import { detectCrawlLanguage } from '../entities/crawls.mts'

const mockDetectLanguage = vi.fn<typeof detectLanguage>()

function makeLinguaResult(iso6391: string) {
  return {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391, iso6393: `${iso6391}x`, confidence: 0.95 }],
  }
}

describe('entity language detection — posts, communities, crawls', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── posts ───────────────────────────────────────────────────────────────

  describe('detectPostLanguage', () => {
    it('returns early without update when post not found', async () => {
      const fakeId = '00000000-0000-7000-8000-000000000001'
      await detectPost(fakeId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns when post has no prior detection', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Post entity test ${random}`,
        markdown: 'Hello world this is an English post',
      })

      await detectPost(postId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      const updated = await getLanguageDetectionStateForTest('posts', postId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection (idempotency) when input sha is already current', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Idempotent Post ${random}`,
        markdown: 'Same content every time',
      })

      // First call → detects
      await detectPost(postId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      // Second call → skips (sha already set and unchanged)
      await detectPost(postId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('uses declared language without calling lingua', async () => {
      const random = createRandomString(10)
      const postId = await insertLanguageDetectionPostForTest({
        createdById: user.id,
        title: `Declared Lang Post ${random}`,
        markdown: 'Bonjour le monde',
        declaredLanguage: 'fr',
      })

      await detectPost(postId)

      expect(mockDetectLanguage).not.toHaveBeenCalled()
      expect(
        (await getLanguageDetectionStateForTest('posts', postId)).lingua_rs_detected_language,
      ).toBe('fr')
    })
  })

  // ─── communities ─────────────────────────────────────────────────────────

  describe('detectCommunityLanguage', () => {
    it('returns early without update when community not found', async () => {
      await detectCommunity('00000000-0000-7000-8000-000000000002')
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns for community without prior detection', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Community entity test ${random}`,
        slug: `comm-entity-${random}`,
      })

      await detectCommunity(communityId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      const updated = await getLanguageDetectionStateForTest('communities', communityId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when input sha is already current (idempotency)', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Idempotent Comm ${random}`,
        slug: `idempotent-comm-${random}`,
      })

      await detectCommunity(communityId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      await detectCommunity(communityId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('uses declared language (default_language) without calling lingua', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Spanish Comm ${random}`,
        slug: `spanish-comm-${random}`,
        defaultLanguage: 'es',
      })

      await detectCommunity(communityId)

      expect(mockDetectLanguage).not.toHaveBeenCalled()
      expect(
        (await getLanguageDetectionStateForTest('communities', communityId))
          .lingua_rs_detected_language,
      ).toBe('es')
    })
  })

  // ─── crawls ───────────────────────────────────────────────────────────────

  describe('detectCrawlLanguage', () => {
    it('returns early without update when crawl not found', async () => {
      await detectCrawl('00000000-0000-7000-8000-000000000003')
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua and writes columns for crawl without prior detection', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)

      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-entity-${random}.example.com`,
        url: `https://crawl-entity-${random}.example.com/page`,
        markdown: 'This is some English crawl content',
      })

      await detectCrawl(crawlId)

      expect(mockDetectLanguage).toHaveBeenCalledOnce()
      const updated = await getLanguageDetectionStateForTest('crawls', crawlId)
      expect(updated.lingua_rs_detected_language).toBe('en')
      expect(updated.lingua_rs_input_sha256).not.toBeNull()
      expect(updated.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips detection when sha is already current (idempotency)', async () => {
      mockDetectLanguage.mockResolvedValueOnce(makeLinguaResult('en'))
      const random = createRandomString(10)

      const crawlId = await insertLanguageDetectionCrawlForTest({
        hostname: `crawl-idem-${random}.example.com`,
        url: `https://crawl-idem-${random}.example.com/page`,
        markdown: 'Idempotent crawl content',
      })

      await detectCrawl(crawlId)
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1)
      vi.clearAllMocks()

      await detectCrawl(crawlId)
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })
  })
})

function detectPost(postId: string): Promise<void> {
  return detectPostLanguage(postId, { detectLanguage: mockDetectLanguage })
}

function detectCommunity(communityId: string): Promise<void> {
  return detectCommunityLanguage(communityId, { detectLanguage: mockDetectLanguage })
}

function detectCrawl(crawlId: string): Promise<void> {
  return detectCrawlLanguage(crawlId, { detectLanguage: mockDetectLanguage })
}
