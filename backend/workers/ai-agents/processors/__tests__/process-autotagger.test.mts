import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createTestMembership,
  insertTestPost,
  markPostFlaggedForModeration,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Job } from 'glide-mq'
import type { AutotaggerPostJobData } from '@queues/ai-agents/types'
import type { runAutotaggerOnPost } from '@agents/autotagger'
import { autotaggerPaidLimitsConfig } from '@services/autotagger'
import { processAutotaggerPost } from '../process-autotagger.mts'

// RSS feed item worker tests live in process-autotagger.part-2.test.mts (split to stay under the
// per-file line cap).

const mockRunAutotaggerOnPost = vi.fn<typeof runAutotaggerOnPost>()

function mockPostJob(data: AutotaggerPostJobData): Job<AutotaggerPostJobData> {
  return { data, name: 'autotagger-post', id: randomUUID() } as Job<AutotaggerPostJobData>
}

function runAutotaggerPost(job: Job<AutotaggerPostJobData>): Promise<unknown> {
  return processAutotaggerPost(job, { runAutotaggerOnPost: mockRunAutotaggerOnPost })
}

let user: PrivateUser
let plusUser: PrivateUser
let proUser: PrivateUser
let adminUser: PrivateUser

describe('processAutotaggerPost', () => {
  beforeAll(async () => {
    user = await createTestUser()
    plusUser = await createTestUser()
    proUser = await createTestUser()
    adminUser = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
    await createTestMembership({ user_id: proUser.id, plan: 'pro' })
  }, 30_000)

  it('returns null when post does not exist', async () => {
    mockRunAutotaggerOnPost.mockClear()
    const result = await runAutotaggerPost(mockPostJob({ id: randomUUID() }))
    expect(result).toBeNull()
    expect(mockRunAutotaggerOnPost).not.toHaveBeenCalled()
  })

  it('returns null when post is flagged by OpenAI omni moderation', async () => {
    mockRunAutotaggerOnPost.mockClear()
    const postId = await insertTestPost({
      title: `Flagged post ${randomUUID()}`,
      slug: `flagged-post-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Flagged content.',
    })
    await markPostFlaggedForModeration(postId)
    const result = await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(result).toBeNull()
    expect(mockRunAutotaggerOnPost).not.toHaveBeenCalled()
  })

  it('calls runAutotaggerOnPost when post exists, is not flagged, and the author has autotagger budget', async () => {
    mockRunAutotaggerOnPost.mockClear()
    mockRunAutotaggerOnPost.mockResolvedValue({ tagged: true } as never)
    const postId = await insertTestPost({
      title: `Autotagger post ${randomUUID()}`,
      slug: `autotagger-post-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Normal content for autotagger.',
    })
    // This test only cares that the worker calls through when nothing blocks it -- decouple that
    // from the tiering feature itself (covered by the dedicated tier tests below) by overriding
    // the free-tier cap to a positive value for this one case.
    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { post_free_max_topics: 1 })
    try {
      const result = await runAutotaggerPost(mockPostJob({ id: postId }))
      expect(mockRunAutotaggerOnPost).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ tagged: true })
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { post_free_max_topics: 0 })
    }
  })

  it('returns null and skips runAutotaggerOnPost for a post with no author', async () => {
    mockRunAutotaggerOnPost.mockClear()
    const postId = await insertTestPost({
      title: `Authorless post ${randomUUID()}`,
      slug: `authorless-post-${randomUUID()}`,
      // posts.created_by_id is nullable (author-deletion case); insertTestPost's TS signature
      // requires a string, so cast around it to exercise this real DB state.
      createdById: null as unknown as string,
      markdown: 'No author.',
    })
    const result = await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(result).toBeNull()
    expect(mockRunAutotaggerOnPost).not.toHaveBeenCalled()
  })

  it('returns null and skips runAutotaggerOnPost for a free-tier author', async () => {
    mockRunAutotaggerOnPost.mockClear()
    const postId = await insertTestPost({
      title: `Free tier post ${randomUUID()}`,
      slug: `free-tier-post-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Free tier content.',
    })
    const result = await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(result).toBeNull()
    expect(mockRunAutotaggerOnPost).not.toHaveBeenCalled()
  })

  it('passes max_topics: 5 for a plus-tier author', async () => {
    mockRunAutotaggerOnPost.mockClear()
    mockRunAutotaggerOnPost.mockResolvedValue({ tagged: true } as never)
    const postId = await insertTestPost({
      title: `Plus tier post ${randomUUID()}`,
      slug: `plus-tier-post-${randomUUID()}`,
      createdById: plusUser.id,
      markdown: 'Plus tier content.',
    })
    await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(mockRunAutotaggerOnPost).toHaveBeenCalledWith(expect.objectContaining({ id: postId }), {
      max_topics: 5,
    })
  })

  it('passes max_topics: 10 for a pro-tier author', async () => {
    mockRunAutotaggerOnPost.mockClear()
    mockRunAutotaggerOnPost.mockResolvedValue({ tagged: true } as never)
    const postId = await insertTestPost({
      title: `Pro tier post ${randomUUID()}`,
      slug: `pro-tier-post-${randomUUID()}`,
      createdById: proUser.id,
      markdown: 'Pro tier content.',
    })
    await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(mockRunAutotaggerOnPost).toHaveBeenCalledWith(expect.objectContaining({ id: postId }), {
      max_topics: 10,
    })
  })

  it('passes max_topics: 10 for an administrator author with no paid membership', async () => {
    mockRunAutotaggerOnPost.mockClear()
    mockRunAutotaggerOnPost.mockResolvedValue({ tagged: true } as never)
    const postId = await insertTestPost({
      title: `Admin post ${randomUUID()}`,
      slug: `admin-post-${randomUUID()}`,
      createdById: adminUser.id,
      markdown: 'Admin content.',
    })
    await runAutotaggerPost(mockPostJob({ id: postId }))
    expect(mockRunAutotaggerOnPost).toHaveBeenCalledWith(expect.objectContaining({ id: postId }), {
      max_topics: 10,
    })
  })

  it('returns null and skips runAutotaggerOnPost when the enabled kill-switch is off, regardless of tier', async () => {
    mockRunAutotaggerOnPost.mockClear()
    const postId = await insertTestPost({
      title: `Disabled post ${randomUUID()}`,
      slug: `disabled-post-${randomUUID()}`,
      createdById: proUser.id,
      markdown: 'Pro tier content, but autotagger disabled.',
    })
    overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: false })
    try {
      const result = await runAutotaggerPost(mockPostJob({ id: postId }))
      expect(result).toBeNull()
      expect(mockRunAutotaggerOnPost).not.toHaveBeenCalled()
    } finally {
      overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, { enabled: true })
    }
  })
})
