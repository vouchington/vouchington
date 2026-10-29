import type { QueryExecutor } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { lockCommunityUsers } from '../bans/lock.mts'

describe('community membership role locks', () => {
  it('locks reversed duplicate user inputs concurrently without deadlocking', async () => {
    const { owner, target, community } = await createOwnerAndTarget()
    const release = Promise.withResolvers<void>()
    const firstAcquiredSignal = Promise.withResolvers<void>()
    const secondAcquiredSignal = Promise.withResolvers<void>()
    let firstAcquired = false
    let secondAcquired = false

    // Barrier both sides so their lockCommunityUsers statements dispatch to Postgres in the
    // same tick, instead of `first` (constructed first) getting an unbounded JS head start
    // that could let its whole combined-lock statement finish before `second` is even sent.
    // lockCommunityUsers acquires every key inside one combined MATERIALIZED-CTE statement
    // (see ../bans/lock.mts), issued as a single query per call — there is no per-key
    // acquisition hook exposed, so this dispatch barrier is the finest-grained interleaving
    // point this test can force without instrumenting lock.mts itself.
    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()

    const first = acquireFirstUserLocks()
    const second = acquireSecondUserLocks()

    async function acquireFirstUserLocks(): Promise<void> {
      await using query = await beginTransaction()
      const barrieredQuery: QueryExecutor = async (input, values) => {
        firstDispatching.resolve()
        await secondDispatching.promise
        return query(input, values)
      }
      await lockCommunityUsers(community.id, [owner.id, target.id, owner.id], {
        query: barrieredQuery,
      })
      firstAcquired = true
      firstAcquiredSignal.resolve()
      await release.promise

      await query.commit()
    }

    async function acquireSecondUserLocks(): Promise<void> {
      await using query = await beginTransaction()
      const barrieredQuery: QueryExecutor = async (input, values) => {
        secondDispatching.resolve()
        await firstDispatching.promise
        return query(input, values)
      }
      await lockCommunityUsers(community.id, [target.id, owner.id, target.id], {
        query: barrieredQuery,
      })
      secondAcquired = true
      secondAcquiredSignal.resolve()
      await release.promise

      await query.commit()
    }

    try {
      // Wait for whichever side actually wins the race to acquire, instead of a fixed delay —
      // a loaded database fork can take longer than any fixed sleep to grant either lock, and
      // a fixed delay would then fail this assertion despite correct locking. The loser
      // genuinely cannot acquire the same advisory lock keys while the winner's transaction
      // still holds them open (blocked below on `release.promise`), so as soon as one signal
      // fires, the other side is deterministically still waiting.
      await Promise.race([firstAcquiredSignal.promise, secondAcquiredSignal.promise])
      expect(firstAcquired).not.toBe(secondAcquired)
    } finally {
      // Always release, even if the assertion above throws — otherwise whichever transaction
      // eventually acquires the locks would hang forever awaiting `release.promise`, turning a
      // simple assertion failure into a test timeout and a leaked pool connection.
      release.resolve()
    }

    await Promise.all([first, second])
    expect(firstAcquired).toBe(true)
    expect(secondAcquired).toBe(true)
  })
})

async function createOwnerAndTarget() {
  const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
  const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
    insertTestCommunityMember({ communityId: community.id, userId: target!.id, role: 'member' }),
  ])
  return { owner: owner!, target: target!, community }
}
