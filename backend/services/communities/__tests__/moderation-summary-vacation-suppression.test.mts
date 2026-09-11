import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityVacation,
  setTestCommunityDigestVacationSuppression,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { getCommunityModerationSummaryCommunities } from '../moderation-summary-emails.mts'

describe('moderation summary vacation suppression', () => {
  it.each([
    { role: 'owner', suppress: true, expired: false, included: false },
    { role: 'owner', suppress: false, expired: false, included: true },
    { role: 'owner', suppress: true, expired: true, included: true },
    { role: 'moderator', suppress: true, expired: false, included: false },
  ] as const)(
    'role=$role suppression=$suppress expired=$expired includes=$included',
    async ({ role, suppress, expired, included }) => {
      const recipient = await createTestUser()
      const community = await insertTestCommunity({ createdById: recipient.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: recipient.id,
        role,
      })
      await setTestCommunityDigestVacationSuppression(community.id, recipient.id, suppress)
      const now = new Date()
      await insertTestCommunityVacation({
        communityId: community.id,
        userId: recipient.id,
        startsAt: new Date(now.getTime() - 7_200_000).toISOString(),
        endsAt: expired ? new Date(now.getTime() - 3_600_000).toISOString() : null,
      })
      const postId = await insertTestPost({
        title: 'Vacation suppression review',
        slug: `vacation-suppression-${recipient.id}`,
        markdown: 'Pending',
        createdById: recipient.id,
        communityId: community.id,
      })
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: recipient.id,
      })

      const rows = await getCommunityModerationSummaryCommunities(
        recipient.id,
        new Date(now.getTime() - 86_400_000),
        new Date(now.getTime() + 1000),
      )
      expect(rows.some(row => row.name === community.name)).toBe(included)
    },
  )
})
