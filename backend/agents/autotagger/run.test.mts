import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'
import { runAutotaggerOnPost } from './run.mts'
import type { Post } from '@services/posts/types'
import { insertPostAutotaggingResult } from '@services/autotagger'
import {
  createTestUserDirect,
  insertTestPost,
  createRandomString,
  setupTestAutotaggerAgent,
} from '@voucha/test-helpers'

// RSS feed item tests live in run-rss-feed-item.test.mts (split to stay under the per-file line
// cap, and to mirror the run.mts / run-rss-feed-item.mts source split).

let testUserId: string
let activePromptId: string

describe('run', () => {
  beforeAll(async () => {
    const activePrompt = await setupTestAutotaggerAgent()
    activePromptId = activePrompt.id

    const testUser = await createTestUserDirect()
    testUserId = testUser!.id
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runAutotaggerOnPost returns null if existing result found', async () => {
    const random = createRandomString(12)
    const postId = await insertTestPost({
      title: 'Post with existing result',
      slug: `test-post-existing-${random}`,
      createdById: testUserId,
      markdown: 'Some content',
    })
    await insertPostAutotaggingResult(postId, Buffer.alloc(32), activePromptId, [])

    const post: Partial<Post> = {
      id: postId,
      title: 'Post with existing result',
      markdown: 'Some content',
    }
    const result = await runAutotaggerOnPost(post as Post)

    expect(result).toBeNull()
  })

  it('runAutotaggerOnPost calls OpenAI when no existing result', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })

    const random = createRandomString(12)
    const postId = await insertTestPost({
      title: 'Test Post',
      slug: `test-post-openai-${random}`,
      createdById: testUserId,
      markdown: 'Content about something interesting',
    })

    const post: Partial<Post> = {
      id: postId,
      title: 'Test Post',
      markdown: 'Content about something interesting',
    }

    const result = await runAutotaggerOnPost(post as Post, { callOpenAIAutotagger })

    expect(result).not.toBeNull()
    expect(result!.skipped).toBe(false)
    expect(callOpenAIAutotagger).toHaveBeenCalled()
  })

  it('runAutotaggerOnPost handles errors gracefully', async () => {
    const callOpenAIAutotagger = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new Error('OpenAI API error'))

    const random = createRandomString(12)
    const postId = await insertTestPost({
      title: 'Test',
      slug: `test-post-graceful-${random}`,
      createdById: testUserId,
      markdown: 'Content',
    })

    const post: Partial<Post> = { id: postId, title: 'Test', markdown: 'Content' }

    const result = await runAutotaggerOnPost(post as Post, { callOpenAIAutotagger })

    expect(result).not.toBeNull()
    expect(result!.error).toBeDefined()
    expect(result!.error).toContain('OpenAI API error')
  })

  it('runAutotaggerOnPost surfaces an error when the autotagger system user is missing', async () => {
    const getSystemUserByUsername = vi.fn<VitestLooseMock>().mockResolvedValue(null)

    const random = createRandomString(12)
    const postId = await insertTestPost({
      title: 'Test',
      slug: `test-post-missing-system-user-${random}`,
      createdById: testUserId,
      markdown: 'Content',
    })

    const post: Partial<Post> = { id: postId, title: 'Test', markdown: 'Content' }

    const result = await runAutotaggerOnPost(post as Post, { getSystemUserByUsername })

    expect(getSystemUserByUsername).toHaveBeenCalledWith('autotagger')
    expect(result).not.toBeNull()
    expect(result!.error).toContain('Autotagger system user not found')
  })

  it('runAutotaggerOnPost rethrows OpenAI rate limit errors', async () => {
    const callOpenAIAutotagger = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new Error('Rate limit exceeded'))
    const isOpenAIRateLimitError = vi.fn<VitestLooseMock>().mockReturnValue(true)

    const random = createRandomString(12)
    const postId = await insertTestPost({
      title: 'Test',
      slug: `test-post-ratelimit-${random}`,
      createdById: testUserId,
      markdown: 'Content',
    })

    const post: Partial<Post> = { id: postId, title: 'Test', markdown: 'Content' }

    await expect(
      runAutotaggerOnPost(post as Post, {
        callOpenAIAutotagger,
        isOpenAIRateLimitError,
      }),
    ).rejects.toThrow('Rate limit exceeded')
  })
})
