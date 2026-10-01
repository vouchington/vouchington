import type { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'
import type { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import type { CommunityPostReview } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import { describe, expect, it, vi } from 'vitest'
import { applyPostCommitSideEffects } from './post-commit-side-effects.mts'

const creator = { id: 'creator-id', roles: [] } as unknown as PrivateUser

describe('applyPostCommitSideEffects', () => {
  it('dispatches post-created listeners and moderation once after commit', async () => {
    const calls: string[] = []
    const enqueuePostCreated = vi.fn<typeof enqueueOnPostCreated>(() => {
      calls.push('post-created')
      return Promise.resolve()
    })
    const enqueueCommunityModeration = vi.fn<typeof enqueueBulkCommunityModerationDispatchers>(
      () => {
        calls.push('community-moderation')
        return Promise.resolve()
      },
    )

    await applyPostCommitSideEffects(
      {
        communityReviews: [
          { approved_at: new Date(), community_id: 'community-id' },
        ] as CommunityPostReview[],
        creator,
        isAdminCreator: false,
        post: { id: 'post-id' },
        postType: 'discussion',
        updates: {},
      },
      {
        enqueueBulkCommunityModerationDispatchers: enqueueCommunityModeration,
        enqueueOnPostCreated: enqueuePostCreated,
      },
    )

    expect(calls).toEqual(['post-created', 'community-moderation'])
    expect(enqueuePostCreated).toHaveBeenCalledOnce()
    expect(enqueueCommunityModeration).toHaveBeenCalledWith([
      { postId: 'post-id', communityId: 'community-id' },
    ])
  })

  it('does not dispatch community moderation for an administrator create', async () => {
    const enqueueCommunityModeration = vi.fn<typeof enqueueBulkCommunityModerationDispatchers>()
    await applyPostCommitSideEffects(
      {
        communityReviews: [
          { approved_at: new Date(), community_id: 'community-id' },
        ] as CommunityPostReview[],
        creator,
        isAdminCreator: true,
        post: { id: 'post-id' },
        postType: 'discussion',
        updates: {},
      },
      { enqueueBulkCommunityModerationDispatchers: enqueueCommunityModeration },
    )
    expect(enqueueCommunityModeration).not.toHaveBeenCalled()
  })
})
