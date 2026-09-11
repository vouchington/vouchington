import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import {
  createTestUser,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionUserForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { detectLanguageMany } from '../detector.mts'
import {
  detectCommunityLanguageBatch,
  detectUserLanguageBatch,
  detectTopicLanguageBatch,
} from '../batch-detect-entities.mts'

const mockDetectLanguageMany = vi.fn<typeof detectLanguageMany>()

function makeBatchResult(iso6391: string) {
  return {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391, iso6393: `${iso6391}x`, confidence: 0.95 }],
  }
}

describe('batch-detect — communities, users, topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── communities ─────────────────────────────────────────────────────────

  describe('detectCommunityLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectCommunityBatch([])
      expect(result).toEqual({ updated: 0 })
    })

    it('detects language for communities and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Batch Community ${random}`,
        slug: `batch-comm-${random}`,
      })

      const result = await detectCommunityBatch([communityId])
      expect(result.updated).toBe(1)

      expect(
        (await getLanguageDetectionStateForTest('communities', communityId))
          .lingua_rs_detected_language,
      ).toBe('en')
    })

    it('skips communities whose sha is already current', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `Skip Comm ${random}`,
        slug: `skip-comm-${random}`,
      })

      await detectCommunityBatch([communityId])
      vi.clearAllMocks()

      const second = await detectCommunityBatch([communityId])
      expect(second.updated).toBe(0)
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })
  })

  // ─── users ────────────────────────────────────────────────────────────────

  describe('detectUserLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectUserBatch([])
      expect(result).toEqual({ updated: 0 })
    })

    it('detects language for users with bio and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-batch-${random}`,
        markdown: 'Hello this is my English bio for batch detection',
      })

      const result = await detectUserBatch([userId])
      expect(result.updated).toBe(1)

      expect(
        (await getLanguageDetectionStateForTest('users', userId)).lingua_rs_detected_language,
      ).toBe('en')
    })

    it('skips users whose sha is already current', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-skip-${random}`,
        markdown: 'Bio that will be skipped second time',
      })

      await detectUserBatch([userId])
      vi.clearAllMocks()

      const second = await detectUserBatch([userId])
      expect(second.updated).toBe(0)
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })
  })

  // ─── topics ───────────────────────────────────────────────────────────────

  describe('detectTopicLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      const result = await detectTopicBatch([])
      expect(result).toEqual({ updated: 0 })
    })

    it('detects language for topics and writes results', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([makeBatchResult('en')])

      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `Batch Topic ${random}`,
        slug: `batch-topic-${random}`,
      })

      const result = await detectTopicBatch([topicId])
      expect(result.updated).toBe(1)

      expect(
        (await getLanguageDetectionStateForTest('topics', topicId)).lingua_rs_detected_language,
      ).toBe('en')
    })
  })
})

function detectCommunityBatch(ids: string[]): Promise<{ updated: number }> {
  return detectCommunityLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}

function detectUserBatch(ids: string[]): Promise<{ updated: number }> {
  return detectUserLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}

function detectTopicBatch(ids: string[]): Promise<{ updated: number }> {
  return detectTopicLanguageBatch(ids, { detectLanguageMany: mockDetectLanguageMany })
}
