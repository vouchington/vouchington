import { describe, it, expect, afterEach, vi, beforeAll } from 'vitest'
import { findExistingPostOpenAIModeration, upsertPostOpenAIModeration } from '../posts.mts'
import { getStoredPostOpenAIModeration } from '../stored-results.mts'
import { createPost } from '@services/posts'
import {
  createTestUser,
  recordTestPostModerationDisposition,
  setPostModerationContentSha256,
  updatePostModerationData,
  getPostModerationData,
} from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import { createPostModerationContent } from '@services/posts/content'
import type { OpenAI } from '@modules/openai-utils'
import type { PrivateUser } from '@services/users/types'

const createOpenAIModeration = vi.fn<VitestLooseMock>()
const dependencies = { createOpenAIModeration }

describe('posts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  function createMockModeration(flagged: boolean): OpenAI.Moderation {
    return {
      flagged,
      categories: {
        harassment: false,
        'harassment/threatening': false,
        hate: false,
        'hate/threatening': false,
        illicit: false,
        'illicit/violent': false,
        'self-harm': false,
        'self-harm/instructions': false,
        'self-harm/intent': false,
        sexual: false,
        'sexual/minors': false,
        violence: false,
        'violence/graphic': false,
      },
      category_scores: {
        harassment: 0.0,
        'harassment/threatening': 0.0,
        hate: 0.0,
        'hate/threatening': 0.0,
        illicit: 0.0,
        'illicit/violent': 0.0,
        'self-harm': 0.0,
        'self-harm/instructions': 0.0,
        'self-harm/intent': 0.0,
        sexual: 0.0,
        'sexual/minors': 0.0,
        violence: 0.0,
        'violence/graphic': 0.0,
      },
      category_applied_input_types: {
        harassment: ['text'],
        'harassment/threatening': ['text'],
        hate: ['text'],
        'hate/threatening': ['text'],
        illicit: ['text'],
        'illicit/violent': ['text'],
        'self-harm': ['text'],
        'self-harm/instructions': ['text'],
        'self-harm/intent': ['text'],
        sexual: ['text'],
        'sexual/minors': ['text'],
        violence: ['text'],
        'violence/graphic': ['text'],
      },
    }
  }

  describe('upsertPostOpenAIModeration with mocked API', () => {
    it('reuses existing moderation results for same content', async () => {
      const random = randomSuffix()

      const sharedTitle = `Reuse Moderation ${random}`
      const sharedMarkdown = `Reuse moderation content ${random}`

      const post1 = await createPost(user, {
        title: sharedTitle,
        markdown: sharedMarkdown,
        post_type: 'discussion',
      })
      const post2 = await createPost(user, {
        title: sharedTitle,
        markdown: sharedMarkdown,
        post_type: 'discussion',
      })
      const { content_sha256 } = createPostModerationContent(post1 as Post)
      const storedResults = [{ flagged: false }]
      await updatePostModerationData(post1.id, content_sha256, storedResults, false)

      const result = await upsertPostOpenAIModeration(post2 as Post)
      expect(result.reused).toBe(true)
      expect(result.content_sha256).toEqual(content_sha256)
      expect(result.results).toEqual([{ flagged: false, categories: {} }])

      const moderationData = (await getPostModerationData(post2.id)) as {
        openai_omni_moderation_content_sha256: Buffer
        openai_omni_moderation_input_sha256: Buffer
        openai_omni_moderation_flagged: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
        openai_omni_moderation_created_at: Date
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.openai_omni_moderation_input_sha256).toEqual(content_sha256)
      expect(moderationData!.openai_omni_moderation_content_sha256).toEqual(content_sha256)

      // Verify the mock was not called since we reused existing results
      expect(createOpenAIModeration).not.toHaveBeenCalled()
    }, 15_000)

    it('calls mocked OpenAI API when no existing results', async () => {
      const random = randomSuffix()

      const post = await createPost(user, {
        title: `New Moderation ${random}`,
        markdown: `New moderation content ${random}`,
        post_type: 'discussion',
      })
      const mockResults = [createMockModeration(false)]
      createOpenAIModeration.mockResolvedValueOnce(mockResults)

      const result = await upsertPostOpenAIModeration(post as Post, { dependencies })

      expect(result.results).toEqual(mockResults)
      expect(createOpenAIModeration).toHaveBeenCalledTimes(1)

      const moderationData = (await getPostModerationData(post.id)) as {
        openai_omni_moderation_content_sha256: Buffer
        openai_omni_moderation_input_sha256: Buffer
        openai_omni_moderation_flagged: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
        openai_omni_moderation_created_at: Date
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.openai_omni_moderation_flagged).toBe(false)
      expect(moderationData!.openai_omni_moderation_results).toEqual({ flagged_categories: [] })
    })

    it('skips moderation when content is already up to date', async () => {
      const random = randomSuffix()

      const post = await createPost(user, {
        title: `Skip Moderation ${random}`,
        markdown: `Skip moderation content ${random}`,
        post_type: 'discussion',
      })
      const { content_sha256 } = createPostModerationContent(post as Post)
      await updatePostModerationData(post.id, content_sha256, [{ flagged: false }], false)

      const result = await upsertPostOpenAIModeration(post as Post)
      expect(result.results).toBeUndefined()
      expect(result.content_sha256).toEqual(content_sha256)

      // Verify the mock was not called since moderation is up to date
      expect(createOpenAIModeration).not.toHaveBeenCalled()
    })

    it('skips moderation when no content to moderate', async () => {
      const random = randomSuffix()

      const post = await createPost(user, {
        title: `Title ${random}`,
        markdown: '',
        post_type: 'discussion',
      })
      // Mock createPostModerationContent to return empty arrays
      const mockPost = { ...post, title: '', markdown: '' }

      const result = await upsertPostOpenAIModeration(mockPost as Post)
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('no_content_to_moderate')

      // Verify the mock was not called since there's no content
      expect(createOpenAIModeration).not.toHaveBeenCalled()
    })

    it('handles flagged content correctly', async () => {
      const random = randomSuffix()

      const post = await createPost(user, {
        title: `Flagged Content ${random}`,
        markdown: `This content will be flagged ${random}`,
        post_type: 'discussion',
      })
      const mockResults = [createMockModeration(true)]
      createOpenAIModeration.mockResolvedValueOnce(mockResults)

      const result = await upsertPostOpenAIModeration(post as Post, { dependencies })

      expect(result.results).toEqual(mockResults)
      expect(createOpenAIModeration).toHaveBeenCalledTimes(1)

      const moderationData = (await getPostModerationData(post.id)) as {
        openai_omni_moderation_flagged: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.openai_omni_moderation_flagged).toBe(true)
      expect(moderationData!.openai_omni_moderation_results).toEqual({ flagged_categories: [] })
    })
  })

  it('reconstructs a bounded stored result instead of exposing provider output', async () => {
    const post = await createPost(user, {
      title: `Malformed moderation ${randomSuffix()}`,
      markdown: 'Malformed moderation result fixture',
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    await updatePostModerationData(post.id, content_sha256, 'untrusted-provider-shape', true)

    await expect(getStoredPostOpenAIModeration(post.id)).resolves.toEqual({
      flagged: true,
      results: [{ flagged: true, categories: {} }],
    })
  })

  it('filters non-string stored category values when reusing a ledger disposition', async () => {
    const post = await createPost(user, {
      title: `Mixed stored categories ${randomSuffix()}`,
      markdown: 'Stored result category fixture',
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    await setPostModerationContentSha256(post.id, content_sha256)
    await recordTestPostModerationDisposition({
      postId: post.id,
      source: 'openai_omni',
      disposition: 'review',
      reasonCode: 'provider_flagged',
      evidence: { flagged_categories: ['harassment', 42, null] },
    })

    await expect(
      findExistingPostOpenAIModeration(content_sha256, { readOnly: false }),
    ).resolves.toEqual({
      flagged: true,
      results: [{ flagged: true, categories: { harassment: true } }],
    })
  })
})
