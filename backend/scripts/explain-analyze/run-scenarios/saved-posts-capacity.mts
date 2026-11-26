import assert from 'node:assert/strict'
import { encodeCursor } from '@modules/pagination'
import { getUserPostsCollection } from '@services/entity-fetch/profile-collections'
import { PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE } from '@services/posts/private-collection-pagination'
import type { PrivateUser } from '@services/users/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  INELIGIBLE_COLLECTION_PAGE_COUNT,
  expectedSavedPosts,
} from '../seed-data/ineligible-collection-pages.mts'

const SCENARIO_ID = 'collection-saved-posts-at-cap'
const PAGE_SIZE = 100
const PAGE_QUERY = 'getVisiblePostCollectionRows'
const HYDRATION_QUERY = 'getPostsByAnyBatch'

export async function captureSavedPostsAtCap(viewer: PrivateUser): Promise<void> {
  const scope = `user-posts:${viewer.id}:saved:${PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE}`
  registerScenarioContract(SCENARIO_ID, {
    expectations: [{ kind: 'queryBinds', token: 'LIMIT', queryContains: PAGE_QUERY }],
    seededRows: { relation__user__save__post: INELIGIBLE_COLLECTION_PAGE_COUNT },
  })
  await runAndCapture(
    SCENARIO_ID,
    async () => {
      let after: string | undefined
      for (const offset of [0, PAGE_SIZE]) {
        const expected = expectedSavedPosts.slice(offset, offset + PAGE_SIZE)
        assert.equal(expected.length, PAGE_SIZE)
        const page = await getUserPostsCollection(viewer, viewer.id, 'saved', {
          limit: PAGE_SIZE,
          after,
        })
        assert.deepEqual(
          page.results.map(post => post.id),
          expected.map(post => post.id),
        )
        assert.deepEqual(page.page_info, {
          has_next_page: true,
          start_cursor: encodeCursor({ ...expected[0]!, scope }),
          end_cursor: encodeCursor({ ...expected.at(-1)!, scope }),
        })
        after = page.page_info.end_cursor!
      }
    },
    undefined,
    undefined,
    { exactCapturedNames: [PAGE_QUERY, HYDRATION_QUERY, PAGE_QUERY, HYDRATION_QUERY] },
  )
}
