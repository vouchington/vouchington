import { describe, expect, it } from 'vitest'
import { runExplicitCommitActionProbe } from '../../../test-helpers/data-stores/psql/post-commit-actions.mts'
import { createTestUser, getTestUserRaw } from '../../../test-helpers/entities/index.mts'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import {
  purgeAfterTestVictimSnapshot,
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
    'preserves native-aborted %s attempts and completes every unheld account on one next tick',
    async mode => {
      const scene = await createReciprocalTestPurgeScene()
      const ids = scene.targets.map(target => target.userId)
      expect(scene.before.map(state => state.notification.notification)).toEqual([true, true])
      expect(scene.before.every(state => state.holds.length > 0)).toBe(true)
      expect(scene.heldBefore.holds.some(hold => hold.released_at === null)).toBe(true)
      const purge = (id: string) =>
        mode === 'direct'
          ? cleanupSoftDeletedUser(id, scene.cutoff)
          : cleanupSoftDeletedUserBatch(scene.cutoff, 50, undefined, undefined, [id])
      const race = await purgeAfterTestVictimSnapshot(
        ids[1]!,
        () => purge(ids[1]!),
        () => purge(ids[0]!),
      )
      expect(race.winner).toBeDefined()
      const outcomes = [race.winner!, race.victim]
      const fulfilled = outcomes.flatMap(outcome =>
        outcome.status === 'fulfilled' ? [outcome.value] : [],
      )
      expect(fulfilled.every(result => !result.hasMore)).toBe(true)
      expect(fulfilled.filter(result => result.deleted !== 0 && result.deleted !== 1)).toEqual([])
      expect(mode === 'direct' ? fulfilled.filter(result => result.deleted !== 1) : []).toEqual([])
      expect(
        mode === 'scheduled' ? outcomes.filter(outcome => outcome.status === 'rejected') : [],
      ).toEqual([])
      const committed = outcomes.map(
        outcome => outcome.status === 'fulfilled' && outcome.value.deleted === 1,
      )
      const abortCodes = outcomes.flatMap((outcome, index) => {
        if (committed[index]) return []
        const error =
          outcome.status === 'rejected'
            ? outcome.reason
            : race.failures.find(failure => failure.userId === ids[index])?.error
        return [testPurgeSqlState(error)]
      })
      expect(abortCodes.filter(code => code !== '40001' && code !== '40P01')).toEqual([])
      const afterRace = await Promise.all(scene.targets.map(readTestPurgeSceneState))
      const timestamp = expect.any(Date)
      expect(afterRace).toEqual(
        scene.before.map((before, index) => ({
          ...before,
          user: committed[index] ? null : before.user,
          references: committed[index]
            ? null
            : {
                ...before.references,
                // A peer's committed DELETE may legitimately clear this incoming reciprocal reference.
                deleted_by_id: committed[1 - index] ? null : before.references!.deleted_by_id,
              },
          witnessReferences: committed[index]
            ? { referrer_user_id: null, deleted_by_id: null }
            : before.witnessReferences,
          clock: { ...before.clock, purged_at: committed[index] ? timestamp : null },
          notifications: committed[index]
            ? { notifications: 0, push_intents: 0 }
            : before.notifications,
          notification: committed[index]
            ? { notification: false, push_intents: 0 }
            : before.notification,
        })),
      )
      expect(await readTestPurgeSceneState(scene.held)).toEqual(scene.heldBefore)

      // Exactly one normal scheduler call, after BOTH racers have settled; never a retry loop.
      const remaining = afterRace.filter(state => state.user !== null).length
      const next = await observeTestUserPurgeAttempt(() =>
        cleanupSoftDeletedUserBatch(scene.cutoff, 50, undefined, undefined, [
          ...ids,
          scene.held.userId,
        ]),
      )
      expect(next.failures).toEqual([])
      expect(next.result).toEqual({ deleted: remaining, hasMore: false })
      const final = await Promise.all(scene.targets.map(readTestPurgeSceneState))
      expect(final).toEqual(
        scene.before.map(before => ({
          ...before,
          notifications: { notifications: 0, push_intents: 0 },
          user: null,
          references: null,
          witnessReferences: { referrer_user_id: null, deleted_by_id: null },
          clock: { ...before.clock, purged_at: timestamp },
          notification: { notification: false, push_intents: 0 },
        })),
      )
      // This held account does not excuse any surviving unheld account above.
      expect(await readTestPurgeSceneState(scene.held)).toEqual(scene.heldBefore)
    },
  )
})
