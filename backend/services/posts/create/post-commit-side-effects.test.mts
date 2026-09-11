import type { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'
import type { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import type { CommunityPostReview } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import { describe, expect, it, vi } from 'vitest'
import type {
  enqueuePostCategoryFinalizationReconciliationBestEffort,
  reconcilePostCategoryFinalization,
} from '../post-category-finalizations.mts'
import { applyPostCommitSideEffects } from './post-commit-side-effects.mts'

const creator = { id: 'creator-id', roles: [] } as unknown as PrivateUser
const postCategoryFinalization = {
  post_id: 'post-id',
  actor_user_ids: ['creator-id'],
  topic_category_owner_id: 'creator-id',
  generation: '1',
}

describe('applyPostCommitSideEffects', () => {
  it('delivers post-created listeners after successful immediate finalization', async () => {
    const calls: string[] = []
    const reconcile = vi.fn<typeof reconcilePostCategoryFinalization>(async () => {
      calls.push('reconcile')
    })
    const enqueuePostCreated = vi.fn<typeof enqueueOnPostCreated>(() => {
      calls.push('post-created')
      return Promise.resolve()
    })
    const enqueueReconciliation =
      vi.fn<typeof enqueuePostCategoryFinalizationReconciliationBestEffort>()
    const enqueueCommunityModeration = vi.fn<typeof enqueueBulkCommunityModerationDispatchers>()

    await applyPostCommitSideEffects(
      {
        communityReviews: [],
        creator,
        isAdminCreator: false,
        post: { id: 'post-id' },
        postCategoryFinalization,
        postType: 'discussion',
        updates: {},
      },
      {
        enqueueBulkCommunityModerationDispatchers: enqueueCommunityModeration,
        enqueueOnPostCreated: enqueuePostCreated,
        enqueuePostCategoryFinalizationReconciliationBestEffort: enqueueReconciliation,
        reconcilePostCategoryFinalization: reconcile,
      },
    )

    expect(calls).toEqual(['reconcile', 'post-created'])
    expect(enqueueReconciliation).not.toHaveBeenCalled()
    expect(enqueueCommunityModeration).toHaveBeenCalledWith([])
  })

  it('reports a finalization failure but still dispatches post-created and community moderation', async () => {
    const finalizationError = new Error('finalization unavailable')
    const reconcile = vi
      .fn<typeof reconcilePostCategoryFinalization>()
      .mockRejectedValue(finalizationError)
    const reportError = vi.fn<(error: Error) => void>()
    const enqueuePostCreated = vi.fn<typeof enqueueOnPostCreated>()
    const enqueueCommunityModeration = vi.fn<typeof enqueueBulkCommunityModerationDispatchers>()
    const enqueueReconciliation =
      vi.fn<typeof enqueuePostCategoryFinalizationReconciliationBestEffort>()

    await expect(
      applyPostCommitSideEffects(
        {
          communityReviews: [
            { approved_at: new Date(), community_id: 'community-id' },
          ] as CommunityPostReview[],
          creator,
          isAdminCreator: false,
          post: { id: 'post-id' },
          postCategoryFinalization,
          postType: 'discussion',
          updates: {},
        },
        {
          enqueueBulkCommunityModerationDispatchers: enqueueCommunityModeration,
          enqueueOnPostCreated: enqueuePostCreated,
          enqueuePostCategoryFinalizationReconciliationBestEffort: enqueueReconciliation,
          onError: reportError,
          reconcilePostCategoryFinalization: reconcile,
        },
      ),
    ).resolves.toBeUndefined()

    expect(reportError).toHaveBeenCalledWith(finalizationError)
    expect(enqueueReconciliation).toHaveBeenCalledOnce()
    expect(enqueuePostCreated).toHaveBeenCalledWith('post-id')
    expect(enqueueCommunityModeration).toHaveBeenCalledWith([
      { postId: 'post-id', communityId: 'community-id' },
    ])
  })
})
