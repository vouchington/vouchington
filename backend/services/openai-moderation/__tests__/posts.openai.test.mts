import { it, expect, beforeAll, describe } from 'vitest'
import { upsertPostOpenAIModeration } from '../posts.mts'
import { createPost } from '@services/posts'
import { createTestUser, getPostModerationData } from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'

describe('posts.openai', () => {
  /**
   * Integration test for OpenAI Moderation API.
   * This file contains one happy-path test that makes a real API call.
   * Other tests are in posts.test.mts (no API) and posts.mock.test.mts (mocked API).
   */

  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it.skipIf(!hasOpenAIKey)(
    'upsertPostOpenAIModeration makes real API call and creates moderation',
    /* no-mistakes: integration=openai */
    async () => {
      const random = randomSuffix()
      const post = await createPost(user, {
        title: `Test Post for OpenAI Moderation Integration ${random}`,
        markdown: `This is a test post with appropriate content that should not be flagged. ${random}`,
        post_type: 'discussion',
      })
      const result = await upsertPostOpenAIModeration(post as Post)

      expect(result).toBeDefined()
      expect(result.content_sha256).toBeInstanceOf(Buffer)
      expect(result.results).toBeDefined()
      if (!Array.isArray(result.results)) {
        throw new TypeError('Moderation results not an array')
      }
      const moderationResults = result.results as Array<{
        flagged: boolean
        categories: Record<string, boolean>
      }>
      expect(moderationResults.length).toBeGreaterThan(0)
      for (const moderationResult of moderationResults) {
        expect(moderationResult).toBeDefined()
        expect(typeof moderationResult.flagged).toBe('boolean')
      }

      const moderationData = (await getPostModerationData(post.id)) as {
        openai_omni_moderation_content_sha256: Buffer
        openai_omni_moderation_input_sha256: Buffer
        openai_omni_moderation_flagged: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
        openai_omni_moderation_created_at: Date
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.openai_omni_moderation_content_sha256).toBeInstanceOf(Buffer)
      expect(moderationData!.openai_omni_moderation_input_sha256).toBeInstanceOf(Buffer)
      expect(typeof moderationData!.openai_omni_moderation_flagged).toBe('boolean')
      expect(moderationData!.openai_omni_moderation_results).toBeDefined()
      expect(moderationData!.openai_omni_moderation_created_at).toBeInstanceOf(Date)
      expect(moderationData!.openai_omni_moderation_content_sha256).toEqual(result.content_sha256)
      expect(moderationData!.openai_omni_moderation_input_sha256).toEqual(result.content_sha256)

      const flagged = moderationResults.some(result => result.flagged)
      expect(moderationData!.openai_omni_moderation_flagged).toBe(flagged)
      expect(moderationData!.openai_omni_moderation_results).toEqual({
        flagged_categories: moderationResults
          .flatMap(result =>
            Object.entries(result.categories)
              .filter(([, categoryFlagged]) => categoryFlagged)
              .map(([category]) => category),
          )
          .toSorted(),
      })

      // Second call should skip (same content already moderated)
      const result2 = await upsertPostOpenAIModeration(post as Post)
      expect(result2).toBeDefined()
      expect(result2.results).toBeUndefined()
      expect(result2.content_sha256).toEqual(result.content_sha256)
    },
    30_000,
  )
})
