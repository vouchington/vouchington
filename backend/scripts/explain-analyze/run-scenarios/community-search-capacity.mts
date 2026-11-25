import { deepStrictEqual, equal } from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { runAndCapture, seedUser } from '../run-support.mts'
import { searchCommunities } from '../run-services.mts'
import { seedUuid } from '../seed-data/common.mts'
import { COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES } from '../seed-data/community-membership-caps.mts'

const PAGE_SIZE = 100

export async function runCommunitySearchCapacityScenario(): Promise<void> {
  // The seeded Explain Membership Cap community names have decimal suffixes sorted as text.
  const expectedPage = Array.from({ length: COMMUNITY_MEMBERSHIP_CAP_COMMUNITIES }, (_, index) =>
    String(index),
  )
    .toSorted()
    .slice(1, PAGE_SIZE + 1)
    .map(suffix => seedUuid(Number(suffix), '22'))
  const after = encodeCursor({ name: 'Explain Membership Cap 0', id: seedUuid(0, '22') })

  await runAndCapture(
    'community-search-at-cap',
    async () => {
      const page = await searchCommunities({
        currentUser: seedUser,
        search: 'membership cap',
        sort: 'name',
        limit: PAGE_SIZE,
        after,
      })
      deepStrictEqual(
        page.results.map(row => row.id),
        expectedPage,
      )
      equal(page.page_info.has_next_page, true)
    },
    undefined,
    'searchCommunities',
    { exactCapturedNames: ['searchCommunities'] },
  )
}
