import {
  expectUnpublishHoldsPublicationLockWhileWaitingOnReview,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { unpublishPostAsAgent } from './agent-moderate.mts'
import { unpublishPost } from './moderate.mts'

describe('unpublishPostAsAgent publication locking', () => {
  it('locks the post publication scope before waiting on the review row', async () => {
    await expectUnpublishHoldsPublicationLockWhileWaitingOnReview({
      title: 'Agent moderation publication lock',
      slugPrefix: 'agent-moderation-publication-lock-',
      reviewLockComment: '/* agent moderation publication lock test */',
      unpublish: ({ communityId, postId }) => unpublishPostAsAgent(communityId, postId),
      assertUnpublished: pending => expect(pending).resolves.toBe('removed'),
    })
  })

  it('locks the post publication scope before a manual unpublish waits on the review row', async () => {
    await expectUnpublishHoldsPublicationLockWhileWaitingOnReview({
      title: 'Manual moderation publication lock',
      slugPrefix: 'manual-moderation-publication-lock-',
      reviewLockComment: '/* manual moderation publication lock test */',
      afterCommunity: ({ owner, communityId }) =>
        insertTestCommunityMember({ communityId, userId: owner.id, role: 'owner' }),
      unpublish: ({ owner, communityId, postId }) => unpublishPost(owner, communityId, postId),
      assertUnpublished: pending => expect(pending).resolves.toBeUndefined(),
    })
  })
})
