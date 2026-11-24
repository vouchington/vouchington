import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { searchCommunityMembers } from '@services/communities/members/get'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID,
  COMMUNITY_MEMBERSHIP_CAP_REGULAR_MEMBERS,
} from '../seed-data/community-membership-caps.mts'

export async function runCommunityRosterReadCapacityScenario(): Promise<void> {
  const limit = 100
  const start = COMMUNITY_MEMBERSHIP_CAP_REGULAR_MEMBERS / 2
  const expectedIds = Array.from({ length: limit }, (_, offset) => seedUuid(start + offset, '24'))
  const cursor = (id: string) => encodeCursor({ name: id, id })

  await runAndCapture(
    'search-community-members-at-cap',
    async () => {
      const page = await searchCommunityMembers(COMMUNITY_MEMBERSHIP_CAP_COMMUNITY_ID, {
        currentUser: seedUser,
        role: 'member',
        limit,
        after: cursor(seedUuid(start - 1, '24')),
      })
      assert.equal(page.results.length, limit)
      assert.deepEqual(
        page.results.map(row => row.id),
        expectedIds,
      )
      assert.deepEqual(page.page_info, {
        has_next_page: true,
        start_cursor: cursor(expectedIds[0]!),
        end_cursor: cursor(expectedIds.at(-1)!),
      })
    },
    undefined,
    'searchCommunityMembers',
    { exactCapturedNames: ['searchCommunityMembers'] },
  )
}
