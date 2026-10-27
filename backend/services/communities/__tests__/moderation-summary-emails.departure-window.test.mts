import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  insertTestCommunityMember,
  removeTestCommunityMember,
} from '@voucha/test-helpers/entities/community-members'
import { insertBackdatedModerationSummaryCommunity } from '@voucha/test-helpers/moderation-summary-activity-community'
import { getCommunityModerationSummaryCommunities } from '../moderation-summary-emails.mts'

describe('moderation summary departed-member window', () => {
  it('counts an owned removal only in its persisted millisecond window', async () => {
    const { owner, community, outsideWindow } = await insertBackdatedModerationSummaryCommunity({
      title: 'Pending review',
      slugPrefix: 'departure-window',
      markdown: 'Pending review.',
    })
    const departed = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: departed.id,
      role: 'member',
      approvedById: owner.id,
      createdAt: outsideWindow,
    })
    const removedAt = await removeTestCommunityMember(community.id, departed.id)
    expect(removedAt).toBeInstanceOf(Date)
    const millis = removedAt!.getTime()
    const netChange = async (start: number, end: number): Promise<number> => {
      const communities = await getCommunityModerationSummaryCommunities(
        owner.id,
        new Date(start),
        new Date(end),
        new Date(end),
      )
      const summary = communities.find(candidate => candidate.name === community.name)
      expect(summary?.pendingPostReviews).toBe(1)
      return summary!.netMemberChange
    }

    expect(await netChange(millis - 1, millis)).toBe(0)
    expect(await netChange(millis, millis + 1)).toBe(-1)
    expect(await netChange(millis + 1, millis + 2)).toBe(0)
  })
})
