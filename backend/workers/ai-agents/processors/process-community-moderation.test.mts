import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '@services/posts/test-support'
import { createPostModerationContent } from '@services/posts/content'
import { insertAgentModerationResult } from '@services/moderation'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  processCommunityModerationDispatcher,
  processCommunityModerationPrompt,
} from './process-community-moderation.mts'

describe('processCommunityModerationDispatcher', () => {
  it('skips missing posts before looking up community prompts', async () => {
    await expect(
      processCommunityModerationDispatcher({
        data: { postId: randomUUID(), communityId: randomUUID() },
      } as Parameters<typeof processCommunityModerationDispatcher>[0]),
    ).resolves.toEqual({ count: 0, skipped: true, reason: 'Post not found' })
  })

  it('skips posts in communities without active prompts', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const community = await insertTestCommunity({
      createdById: user!.id,
      name: `No Prompt Dispatcher Community ${randomUUID()}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
    })
    const post = await createCommunityPostFixture(user!, community.id, {
      title: `No prompt dispatcher post ${randomUUID()}`,
      markdown: 'Community moderation dispatcher body',
    })

    await expect(
      processCommunityModerationDispatcher({
        data: { postId: post.id, communityId: community.id },
      } as Parameters<typeof processCommunityModerationDispatcher>[0]),
    ).resolves.toEqual({
      count: 0,
      skipped: true,
      reason: 'No active prompts for this community',
    })
  })

  it('skips posts when all active prompts already moderated the current content', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    await createTestMembership({ user_id: user!.id, plan: 'plus' })
    const community = await insertTestCommunity({
      createdById: user!.id,
      name: `Processed Dispatcher Community ${randomUUID()}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
    })
    const post = await createCommunityPostFixture(user!, community.id, {
      title: `Processed dispatcher post ${randomUUID()}`,
      markdown: 'Community moderation dispatcher body',
    })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user!.id,
      slotAllocated: true,
      prompt: 'Already processed prompt',
    })
    const { content_sha256: inputSha256 } = createPostModerationContent(post)
    await insertAgentModerationResult(
      post.id,
      inputSha256,
      prompt.id,
      prompt.agent_id,
      { flagged: false, reason: 'Already processed' },
      false,
    )

    await expect(
      processCommunityModerationDispatcher({
        data: { postId: post.id, communityId: community.id },
      } as Parameters<typeof processCommunityModerationDispatcher>[0]),
    ).resolves.toEqual({
      count: 0,
      skipped: true,
      reason: 'All prompts already processed this content',
    })
  })

  it('enqueues active prompts that have not already moderated the current post content', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    await createTestMembership({ user_id: user!.id, plan: 'plus' })
    const community = await insertTestCommunity({
      createdById: user!.id,
      name: `Dispatcher Community ${randomUUID()}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
    })
    const post = await createCommunityPostFixture(user!, community.id, {
      title: `Dispatcher post ${randomUUID()}`,
      markdown: 'Community moderation dispatcher body',
    })
    const [alreadyModeratedPrompt, promptNeedingRun, inactivePrompt] = await Promise.all([
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user!.id,
        slotAllocated: true,
        prompt: 'Already processed prompt',
      }),
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user!.id,
        slotAllocated: true,
        prompt: 'Needs processing prompt',
      }),
      insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user!.id,
        slotAllocated: false,
        prompt: 'Inactive prompt',
      }),
    ])
    const { content_sha256: inputSha256 } = createPostModerationContent(post)
    await insertAgentModerationResult(
      post.id,
      inputSha256,
      alreadyModeratedPrompt.id,
      alreadyModeratedPrompt.agent_id,
      { flagged: false, reason: 'Already processed' },
      false,
    )

    const result = await processCommunityModerationDispatcher({
      data: { postId: post.id, communityId: community.id },
    } as Parameters<typeof processCommunityModerationDispatcher>[0])

    expect(result).toEqual({ success: true, dispatched: true, count: 1, skipped: false })
    await expect
      .poll(async () => {
        const waiting = await readAllQueueJobs(ai_agents)
        return getQueuedPromptIdsForPost(waiting, post.id)
      })
      .toEqual([promptNeedingRun.id])
    const waiting = await readAllQueueJobs(ai_agents)
    const promptIds = getQueuedPromptIdsForPost(waiting, post.id)
    expect(promptIds).not.toContain(alreadyModeratedPrompt.id)
    expect(promptIds).not.toContain(inactivePrompt.id)
  })
})

describe('processCommunityModerationPrompt', () => {
  it('returns a failed result when the post is missing', async () => {
    await expect(
      processCommunityModerationPrompt({
        data: {
          postId: randomUUID(),
          communityId: randomUUID(),
          promptId: randomUUID(),
        },
      } as Parameters<typeof processCommunityModerationPrompt>[0]),
    ).resolves.toEqual({ success: false, reason: 'Post not found' })
  })

  it('runs the community moderation agent for existing posts', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const community = await insertTestCommunity({
      createdById: user!.id,
      name: `Prompt Community ${randomUUID()}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
    })
    const post = await createCommunityPostFixture(user!, community.id, {
      title: `Prompt post ${randomUUID()}`,
      markdown: 'Already moderated prompt body',
    })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user!.id,
      slotAllocated: true,
      prompt: 'No content prompt',
    })
    const { content_sha256: inputSha256 } = createPostModerationContent(post)
    await insertAgentModerationResult(
      post.id,
      inputSha256,
      prompt.id,
      prompt.agent_id,
      { flagged: false, reason: 'Already processed' },
      false,
    )

    await expect(
      processCommunityModerationPrompt({
        data: {
          postId: post.id,
          communityId: community.id,
          promptId: prompt.id,
        },
      } as Parameters<typeof processCommunityModerationPrompt>[0]),
    ).resolves.toEqual({
      success: true,
      flagged: false,
      skipped: true,
      error: undefined,
    })
  })
})

function getQueuedPromptIdsForPost(
  jobs: Awaited<ReturnType<typeof ai_agents.getJobs>>,
  postId: string,
): Array<string | undefined> {
  const promptIds: Array<string | undefined> = []
  for (const job of jobs) {
    if (
      job.name === 'community-moderation-prompt' &&
      (job.data as { postId?: string }).postId === postId
    ) {
      promptIds.push((job.data as { promptId?: string }).promptId)
    }
  }
  return promptIds.toSorted()
}
