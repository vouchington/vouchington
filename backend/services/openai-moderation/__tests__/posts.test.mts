import { describe, it, expect, afterEach, beforeEach, vi, beforeAll } from 'vitest'
import * as moderation from '@modules/openai-utils/moderate'
import { upsertPostOpenAIModeration } from '../posts.mts'
import { createPost } from '@services/posts'
import {
  createTestUser,
  recordTestPostModerationDisposition,
  setPostModerationContentSha256,
  updatePostModerationData,
  getPostModerationData,
  WEB_PROVENANCE,
  createOpenAIModerationResponse,
} from '@voucha/test-helpers'
import type { Post } from '@services/posts/types'
import { createPostModerationContent } from '@services/posts/content'
import type { PrivateUser } from '@services/users/types'

// The OpenAI call is the provider edge; everything above it runs for real.
const requestOpenAIModeration = vi.spyOn(moderation, 'requestOpenAIModeration')

describe('posts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    requestOpenAIModeration.mockReset()
    requestOpenAIModeration.mockRejectedValue(new Error('Unexpected OpenAI request'))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  describe('upsertPostOpenAIModeration with mocked API', () => {
    it('reuses existing moderation results for same content', async () => {
      const random = randomSuffix()

      const sharedTitle = `Reuse Moderation ${random}`
      const sharedMarkdown = `Reuse moderation content ${random}`

      const post1 = await createPost(user, WEB_PROVENANCE, {
        title: sharedTitle,
        markdown: sharedMarkdown,
        post_type: 'discussion',
      })
      const post2 = await createPost(user, WEB_PROVENANCE, {
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
        is_flagged_by_openai_omni_moderation: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
        openai_omni_moderation_created_at: Date
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.openai_omni_moderation_input_sha256).toEqual(content_sha256)
      expect(moderationData!.openai_omni_moderation_content_sha256).toEqual(content_sha256)

      // Verify the API was not called since we reused existing results
      expect(requestOpenAIModeration).not.toHaveBeenCalled()
    })

    it('calls the OpenAI API when no existing results', async () => {
      const random = randomSuffix()

      const post = await createPost(user, WEB_PROVENANCE, {
        title: `New Moderation ${random}`,
        markdown: `New moderation content ${random}`,
        post_type: 'discussion',
      })
      requestOpenAIModeration.mockResolvedValueOnce(createOpenAIModerationResponse())

      const result = await upsertPostOpenAIModeration(post as Post)

      expect(result.results).toMatchObject([{ flagged: false }])
      expect(result.flagged).toBe(false)
      expect(requestOpenAIModeration).toHaveBeenCalledExactlyOnceWith(
        [
          { type: 'text', text: `New Moderation ${random}` },
          { type: 'text', text: `New moderation content ${random}` },
        ],
        'omni-moderation-latest',
      )

      const moderationData = (await getPostModerationData(post.id)) as {
        openai_omni_moderation_content_sha256: Buffer
        openai_omni_moderation_input_sha256: Buffer
        is_flagged_by_openai_omni_moderation: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
        openai_omni_moderation_created_at: Date
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.is_flagged_by_openai_omni_moderation).toBe(false)
      expect(moderationData!.openai_omni_moderation_results).toEqual({ flagged_categories: [] })
    })

    it('skips moderation when content is already up to date', async () => {
      const random = randomSuffix()

      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Skip Moderation ${random}`,
        markdown: `Skip moderation content ${random}`,
        post_type: 'discussion',
      })
      const { content_sha256 } = createPostModerationContent(post as Post)
      await updatePostModerationData(post.id, content_sha256, [{ flagged: false }], false)

      const result = await upsertPostOpenAIModeration(post as Post)
      expect(result.results).toBeUndefined()
      expect(result.content_sha256).toEqual(content_sha256)

      // Verify the API was not called since moderation is up to date
      expect(requestOpenAIModeration).not.toHaveBeenCalled()
    })

    it('skips moderation when no content to moderate', async () => {
      const random = randomSuffix()

      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Title ${random}`,
        markdown: '',
        post_type: 'discussion',
      })
      // Mock createPostModerationContent to return empty arrays
      const mockPost = { ...post, title: '', markdown: '' }

      const result = await upsertPostOpenAIModeration(mockPost as Post)
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe('no_content_to_moderate')

      // Verify the API was not called since there's no content
      expect(requestOpenAIModeration).not.toHaveBeenCalled()
    })

    it('handles flagged content correctly', async () => {
      const random = randomSuffix()

      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Flagged Content ${random}`,
        markdown: `This content will be flagged ${random}`,
        post_type: 'discussion',
      })
      requestOpenAIModeration.mockResolvedValueOnce(
        createOpenAIModerationResponse(true, { violence: true }),
      )

      const result = await upsertPostOpenAIModeration(post as Post)

      expect(result.results).toMatchObject([{ flagged: true, categories: { violence: true } }])
      expect(result.flagged).toBe(true)
      expect(requestOpenAIModeration).toHaveBeenCalledOnce()

      const moderationData = (await getPostModerationData(post.id)) as {
        is_flagged_by_openai_omni_moderation: boolean
        openai_omni_moderation_results: { flagged_categories: string[] }
      } | null

      expect(moderationData).toBeDefined()
      expect(moderationData!.is_flagged_by_openai_omni_moderation).toBe(true)
      expect(moderationData!.openai_omni_moderation_results).toEqual({
        flagged_categories: ['violence'],
      })
    })
  })

  it('filters non-string stored category values when reusing a ledger disposition', async () => {
    const title = `Mixed stored categories ${randomSuffix()}`
    const markdown = 'Stored result category fixture'
    const donor = await createPost(user, WEB_PROVENANCE, {
      title,
      markdown,
      post_type: 'discussion',
    })
    const post = await createPost(user, WEB_PROVENANCE, {
      title,
      markdown,
      post_type: 'discussion',
    })
    const { content_sha256 } = createPostModerationContent(post as Post)
    await setPostModerationContentSha256(donor.id, content_sha256)
    await recordTestPostModerationDisposition({
      postId: donor.id,
      source: 'openai_omni',
      disposition: 'review',
      reasonCode: 'provider_flagged',
      evidence: { flagged_categories: ['harassment', 42, null] },
    })
    await setPostModerationContentSha256(post.id, content_sha256)

    const result = await upsertPostOpenAIModeration(post as Post, { readOnly: false })

    expect(requestOpenAIModeration).not.toHaveBeenCalled()
    expect(result).toEqual({
      results: [{ flagged: true, categories: { harassment: true } }],
      content_sha256,
      reused: true,
      flagged: true,
    })
  })
})
