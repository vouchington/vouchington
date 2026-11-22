import { describe, expect, it } from 'vitest'
import { runExplicitCommitActionProbe } from '../../../test-helpers/data-stores/psql/post-commit-actions.mts'
import { createTestUser, getTestUserRaw } from '../../../test-helpers/entities/index.mts'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import {
  purgeBothAfterTestUserLocks,
  testPurgeSqlState,
  observeTestUserPurgeAttempt,
} from '../../../test-helpers/reciprocal-user-purge.mts'
import {
  createReciprocalTestPurgeScene,
  readTestPurgeSceneState,
} from '../../../test-helpers/reciprocal-user-purge-scene.mts'

describe('reciprocal final user purges', () => {
  it('settles owned post-commit actions before an observed attempt returns', async () => {
    const user = await createTestUser()
    let settled = false
    const observed = await observeTestUserPurgeAttempt(() =>
      runExplicitCommitActionProbe(async () => {
        expect(await getTestUserRaw(user.id)).toEqual(expect.objectContaining({ id: user.id }))
        settled = true
      }),
    )
    expect(observed).toEqual({ result: false, failures: [] })
    expect(settled).toBe(true)
  })

  it.each(['direct', 'scheduled'] as const)(
    'breaks a deadlock between reciprocal %s purges and purges the loser on the next tick',
    async mode => {
      const scene = await createReciprocalTestPurgeScene()
      const ids = scene.targets.map(target => target.userId) as [string, string]
      const purge = (id: string) =>
        mode === 'direct'
          ? cleanupSoftDeletedUser(id, scene.cutoff)
          : cleanupSoftDeletedUserBatch(scene.cutoff, 50, undefined, undefined, [id])
      const outcomes = await purgeBothAfterTestUserLocks(ids, purge)

      // Each purge holds its own row and needs the other's: the database aborts exactly one.
      const fulfilled = outcomes.flatMap(outcome =>
        outcome.status === 'fulfilled' ? [outcome.value] : [],
      )
      expect(fulfilled).toContainEqual({ deleted: 1, hasMore: false })
      const aborted = outcomes.flatMap(outcome =>
        outcome.status === 'rejected' ? [testPurgeSqlState(outcome.reason)] : [],
      )
      // The scheduled path reports the collision and stops that page; the direct path rejects.
      expect(aborted).toEqual(mode === 'direct' ? ['40P01'] : [])
      const expectedResults = [
        { deleted: 1, hasMore: false },
        ...(mode === 'direct' ? [] : [{ deleted: 0, hasMore: false }]),
      ]
      expect(fulfilled).toHaveLength(expectedResults.length)
      expect(fulfilled).toEqual(expect.arrayContaining(expectedResults))
      const afterRace = await Promise.all(scene.targets.map(readTestPurgeSceneState))
      expect(afterRace.filter(state => state.user !== null)).toHaveLength(1)

      // Exactly one normal scheduler call, after both purges have settled.
      const next = await observeTestUserPurgeAttempt(() =>
        cleanupSoftDeletedUserBatch(scene.cutoff, 50, undefined, undefined, [
          ...ids,
          scene.held.userId,
        ]),
      )
      expect(next.failures).toEqual([])
      expect(next.result).toEqual({ deleted: 1, hasMore: false })
      const final = await Promise.all(scene.targets.map(readTestPurgeSceneState))
      expect(final.map(state => state.user)).toEqual([null, null])
      expect(final.every(state => state.pending && state.clock?.purged_at instanceof Date)).toBe(
        true,
      )
      // The held account is untouched.
      expect(await readTestPurgeSceneState(scene.held)).toEqual(scene.heldBefore)
    },
  )
})
