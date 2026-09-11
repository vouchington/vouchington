import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { resolveBanEvasionSystemReports } from '../resolve-system-report.mts'

describe('resolveBanEvasionSystemReports', () => {
  it('does not write moderator actions when there are no pending system reports', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })

    await resolveBanEvasionSystemReports(owner!.id, community.id, member!.id, 'dismissed')

    const actions = await getModeratorActionRowsForTest({
      actorId: owner!.id,
      communityId: community.id,
    })
    expect(actions).toEqual([])
  })
})
