import assert from 'node:assert/strict'
import { paginationMaxima } from '@services/pagination/config'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runFeedSharerHydrationCapacityScenario(): Promise<void> {
  const limit = paginationMaxima.max_limit
  // Alternate across the ordinary users and the developer-role cohort seeded at index 10,000
  // and above. Developer roles stay private and do not make a sharer an official account.
  const expected = Array.from({ length: limit }, (_, offset) => {
    const index = offset % 2 === 0 ? 1_700 + 61 * offset : 18_000 - 61 * offset
    return {
      id: seedUuid(index, '01'),
      username: `seeduser${index}`,
      roles: [],
      account_type: null,
    }
  })
  const ids = expected.map(user => user.id)
  assert.equal(new Set(ids).size, limit)

  await runAndCapture(
    'feed-shared-by-users-batch-at-cap',
    async () => {
      const users = await getPublicUsersByAnyBatch(ids)
      assert.deepEqual(
        users.map(
          user =>
            user && {
              id: user.id,
              username: user.username,
              roles: user.roles,
              account_type: user.account_type,
            },
        ),
        expected,
      )
    },
    undefined,
    'getPublicUsersByAnyBatch',
    { exactCapturedNames: ['getPublicUsersByAnyBatch'] },
  )
}
