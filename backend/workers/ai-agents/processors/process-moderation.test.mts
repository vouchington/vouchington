import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import {
  AI_GENERATED_MODERATOR_SLUG,
  disableCommunityAutoTaggerAgent,
  enableCommunityAutoTaggerAgent,
  SELF_PROMOTION_MODERATOR_SLUG,
} from '@services/moderation'
import type { PrivateUser } from '@services/users/types'
import type { Job } from 'glide-mq'
import type { ModerationDispatcherJobData, ModerationPromptJobData } from '@queues/ai-agents/types'
import { ai_agents } from '@queues/ai-agents/queues'
import { processModerationDispatcher } from './process-moderation.mts'

describe('process-moderation', () => {
  function mockJob(data: ModerationDispatcherJobData): Job<ModerationDispatcherJobData> {
    return {
      data,
      name: 'moderation-dispatcher',
      id: randomUUID(),
    } as Job<ModerationDispatcherJobData>
  }

  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  describe('processModerationDispatcher', () => {
    it('returns skipped when post does not exist', async () => {
      const result = await processModerationDispatcher(mockJob({ id: randomUUID() }))
      expect(result).toMatchObject({ count: 0, skipped: true, reason: 'Post not found' })
    })

    it('dispatches baseline moderator even when no community agents are enabled', async () => {
      const community = await insertTestCommunity({
        createdById: adminUser.id,
        slug: `mod-dispatch-baseline-${randomUUID()}`,
      })
      const postId = await insertTestPost({
        title: `Test post ${randomUUID()}`,
        slug: `test-post-${randomUUID()}`,
        createdById: adminUser.id,
        markdown: 'Test content for moderation dispatch.',
        communityId: community.id,
      })

      const result = (await processModerationDispatcher(mockJob({ id: postId }))) as {
        dispatched: boolean
        moderators_count: number
        moderators: string[]
      }

      expect(result.dispatched).toBe(true)
      expect(result.moderators).toContain(AI_GENERATED_MODERATOR_SLUG)
      const waiting = await readAllQueueJobs(ai_agents)
      const baselineJob = waiting.find(
        j =>
          j.name === 'moderation-prompt' &&
          (j.data as ModerationPromptJobData).id === postId &&
          (j.data as ModerationPromptJobData).moderatorSlug === AI_GENERATED_MODERATOR_SLUG,
      )
      expect(baselineJob?.data).toMatchObject({ source: 'baseline' })
    })

    it('does not dispatch disabled baseline moderator', async () => {
      const community = await insertTestCommunity({
        createdById: adminUser.id,
        slug: `mod-dispatch-disabled-baseline-${randomUUID()}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: adminUser.id,
        role: 'owner',
      })
      await disableCommunityAutoTaggerAgent(adminUser, community.id, AI_GENERATED_MODERATOR_SLUG)
      const postId = await insertTestPost({
        title: `Test post ${randomUUID()}`,
        slug: `test-post-${randomUUID()}`,
        createdById: adminUser.id,
        markdown: 'Test content for moderation dispatch.',
        communityId: community.id,
      })

      const result = await processModerationDispatcher(mockJob({ id: postId }))

      expect(result).toMatchObject({ skipped: true })
    })

    it('dispatches both baseline and community AI agents for a new post', async () => {
      const community = await insertTestCommunity({
        createdById: adminUser.id,
        slug: `mod-dispatch-enabled-${randomUUID()}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: adminUser.id,
        role: 'owner',
      })
      await enableCommunityAutoTaggerAgent(adminUser, community.id, SELF_PROMOTION_MODERATOR_SLUG)
      const postId = await insertTestPost({
        title: `Test post ${randomUUID()}`,
        slug: `test-post-${randomUUID()}`,
        createdById: adminUser.id,
        markdown: 'Test content for moderation dispatch.',
        communityId: community.id,
      })

      const result = (await processModerationDispatcher(mockJob({ id: postId }))) as {
        dispatched: boolean
        moderators_count: number
        moderators: string[]
      }

      expect(result.dispatched).toBe(true)
      expect(result.moderators).toContain(AI_GENERATED_MODERATOR_SLUG)
      expect(result.moderators).toContain(SELF_PROMOTION_MODERATOR_SLUG)
      const waiting = await readAllQueueJobs(ai_agents)
      const communityJob = waiting.find(
        j =>
          j.name === 'moderation-prompt' &&
          (j.data as ModerationPromptJobData).id === postId &&
          (j.data as ModerationPromptJobData).moderatorSlug === SELF_PROMOTION_MODERATOR_SLUG,
      )
      expect(communityJob?.data).toMatchObject({ source: 'community' })
    })
  })
})
