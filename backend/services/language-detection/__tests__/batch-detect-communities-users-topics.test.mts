import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  getLanguageDetectionStateForTest,
  insertLanguageDetectionCommunityForTest,
  insertLanguageDetectionTopicForTest,
  insertLanguageDetectionUserForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  detectCommunityLanguageBatch,
  detectUserLanguageBatch,
  detectTopicLanguageBatch,
} from '../batch-detect-entities.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'

describe('batch-detect — communities, users, topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('detectCommunityLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectCommunityLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language for communities and writes results', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `${ENGLISH} ${random}`,
        slug: `batch-comm-${random}`,
      })

      const result = await detectCommunityLanguageBatch([communityId])
      expect(result).toEqual({ updated: 1 })

      const state = await getLanguageDetectionStateForTest('communities', communityId)
      expect(state.lingua_rs_detected_language).toBe('en')
      expect(state.lingua_rs_input_sha256).toHaveLength(32)
      expect(state.lingua_rs_detected_at).toBeInstanceOf(Date)
    })

    it('skips communities whose sha is already current', async () => {
      const random = createRandomString(10)
      const communityId = await insertLanguageDetectionCommunityForTest({
        createdById: user.id,
        name: `${GERMAN} ${random}`,
        slug: `skip-comm-${random}`,
      })

      expect(await detectCommunityLanguageBatch([communityId])).toEqual({ updated: 1 })
      const first = await getLanguageDetectionStateForTest('communities', communityId)
      expect(first.lingua_rs_detected_language).toBe('de')

      expect(await detectCommunityLanguageBatch([communityId])).toEqual({ updated: 0 })
      expect(await getLanguageDetectionStateForTest('communities', communityId)).toEqual(first)
    })
  })

  describe('detectUserLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectUserLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language for users with bio and writes results', async () => {
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-batch-${random}`,
        markdown: ENGLISH,
      })

      expect(await detectUserLanguageBatch([userId])).toEqual({ updated: 1 })

      const state = await getLanguageDetectionStateForTest('users', userId)
      expect(state.lingua_rs_detected_language).toBe('en')
      expect(state.lingua_rs_input_sha256).toHaveLength(32)
    })

    it('skips users whose sha is already current', async () => {
      const random = createRandomString(10)
      const userId = await insertLanguageDetectionUserForTest({
        username: `user-skip-${random}`,
        markdown: GERMAN,
      })

      expect(await detectUserLanguageBatch([userId])).toEqual({ updated: 1 })
      const first = await getLanguageDetectionStateForTest('users', userId)
      expect(first.lingua_rs_detected_language).toBe('de')

      expect(await detectUserLanguageBatch([userId])).toEqual({ updated: 0 })
      expect(await getLanguageDetectionStateForTest('users', userId)).toEqual(first)
    })
  })

  describe('detectTopicLanguageBatch', () => {
    it('returns { updated: 0 } for empty ids array', async () => {
      expect(await detectTopicLanguageBatch([])).toEqual({ updated: 0 })
    })

    it('detects language for topics and writes results', async () => {
      const random = createRandomString(10)
      const topicId = await insertLanguageDetectionTopicForTest({
        createdById: user.id,
        name: `${GERMAN} ${random}`,
        slug: `batch-topic-${random}`,
      })

      expect(await detectTopicLanguageBatch([topicId])).toEqual({ updated: 1 })

      const state = await getLanguageDetectionStateForTest('topics', topicId)
      expect(state.lingua_rs_detected_language).toBe('de')
      expect(state.lingua_rs_input_sha256).toHaveLength(32)
    })
  })
})
