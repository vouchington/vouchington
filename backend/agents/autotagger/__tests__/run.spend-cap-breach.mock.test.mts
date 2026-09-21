import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAutotaggerOnPost } from '../run.mts'
import type { Post } from '@services/posts/types'
import {
  createTestUserDirect,
  insertTestPost,
  setupTestAutotaggerAgent,
} from '@voucha/test-helpers'
import { createOpenRouterResponse } from '@modules/openrouter-utils'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'

vi.mock<typeof import('@modules/openrouter-utils')>(
  import('@modules/openrouter-utils'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenRouterResponse: vi.fn<VitestLooseMock>(),
  }),
)

describe('runAutotaggerOnPost spend-cap breach', () => {
  let testUserId: string

  beforeAll(async () => {
    await setupTestAutotaggerAgent()
    const testUser = await createTestUserDirect()
    testUserId = testUser!.id
  }, 30_000)

  beforeEach(() => {
    vi.mocked(createOpenRouterResponse).mockReset()
  })

  it('rethrows OpenAiSpendCapBreachError instead of swallowing it into an error result', async () => {
    const random = randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      title: `Autotagger spend cap breach test post ${random}`,
      slug: `autotagger-spend-cap-breach-${random}`,
      createdById: testUserId,
      markdown: `Test content ${random}`,
    })
    const post: Partial<Post> = {
      id: postId,
      title: `Autotagger spend cap breach test post ${random}`,
      markdown: `Test content ${random}`,
    }

    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    vi.mocked(createOpenRouterResponse).mockRejectedValueOnce(new OpenAiSpendCapBreachError(breach))

    await expect(runAutotaggerOnPost(post as Post)).rejects.toThrow(OpenAiSpendCapBreachError)
  })
})
