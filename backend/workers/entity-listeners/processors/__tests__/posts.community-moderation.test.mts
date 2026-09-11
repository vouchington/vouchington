import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  readAllQueueJobs,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { ai_agents } from '@queues/ai-agents/queues'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { createPostRevision } from '@services/post-revisions'
import { setPostClearanceStatus } from '@services/post-clearance/update-status'
import type { Post } from '@services/posts/types'
import { processPostUpdated } from '../posts.mts'
import { recoverPostCreatedEffects } from '../post-created-recovery.mts'

describe('post entity listener community moderation dispatch', () => {
  it('enqueues community moderation dispatchers for approved reviews when content changes', async () => {
    const creator = await createTestUser()
    expect(creator).toBeTruthy()
    const postId = await insertTestPost({
      title: `Community moderation listener post ${randomUUID()}`,
      slug: `community-moderation-listener-post-${randomUUID()}`,
      createdById: creator!.id,
      markdown: 'Community moderation post body',
      clearanceStatus: 'approved',
    })
    const community = await insertTestCommunity({ createdById: creator!.id })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: creator!.id,
    })
    const post = (await getPostByAny(postId)) as Post
    const { content_sha256 } = createPostModerationContent(post)
    await setPostLLMModerationContentSha256(postId, content_sha256)

    await processPostUpdated({ id: postId, contentChanged: true })
    await expect
      .poll(async () => {
        const jobs = await readAllQueueJobs(ai_agents)
        return jobs.some(
          job =>
            job.name === 'community-moderation-dispatcher' &&
            (job.data as { postId?: string; communityId?: string }).postId === postId &&
            (job.data as { postId?: string; communityId?: string }).communityId === community.id,
        )
      })
      .toBe(true)
  })

  it('skips moderation for a pre-marker administrator creation', async () => {
    const administrator = await createTestUser({ administrator: true })
    const postId = await insertTestPost({
      title: `Pre-marker administrator creation ${randomUUID()}`,
      slug: `pre-marker-administrator-creation-${randomUUID()}`,
      createdById: administrator.id,
      markdown: 'Trusted administrator community post.',
      clearanceStatus: 'pending',
      createdAt: new Date(Date.now() + 1_000),
    })
    await createPostRevision(postId, 'create', {}, administrator.id)
    await setPostClearanceStatus(postId, 'approved', administrator.id)
    const community = await insertTestCommunity({ createdById: administrator.id })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: administrator.id,
    })
    const enqueueCommunityModerationDispatchers = vi
      .fn<(items: Array<{ postId: string; communityId: string }>) => Promise<void>>()
      .mockResolvedValue()

    await recoverPostCreatedEffects(
      { id: postId, post_type: 'discussion' },
      { enqueueCommunityModerationDispatchers },
    )

    expect(enqueueCommunityModerationDispatchers).not.toHaveBeenCalled()
  })

  it('propagates a recovered moderation enqueue failure for checkpoint retry', async () => {
    const creator = await createTestUser()
    const postId = await insertTestPost({
      title: `Recovered moderation ${randomUUID()}`,
      slug: `recovered-moderation-${randomUUID()}`,
      createdById: creator.id,
      markdown: 'Recovered moderation body',
      clearanceStatus: 'approved',
    })
    const community = await insertTestCommunity({ createdById: creator.id })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: creator.id,
    })
    const enqueueError = new Error('community moderation queue unavailable')
    const enqueueCommunityModerationDispatchers = vi
      .fn<(items: Array<{ postId: string; communityId: string }>) => Promise<void>>()
      .mockRejectedValue(enqueueError)

    await expect(
      recoverPostCreatedEffects(
        { id: postId, post_type: 'discussion' },
        { enqueueCommunityModerationDispatchers },
      ),
    ).rejects.toBe(enqueueError)
    expect(enqueueCommunityModerationDispatchers).toHaveBeenCalledWith([
      { postId, communityId: community.id },
    ])
  })
})
