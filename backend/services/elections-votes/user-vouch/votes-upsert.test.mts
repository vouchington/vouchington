import { beforeAll, expect, it, describe } from 'vitest'
import {
  createTestUser,
  getEntityRelation,
  getFollowExists,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { withOnlyOneWritePoolClientAvailable } from '@voucha/test-helpers/write-pool-probe'
import { withOwnedVouchStats } from '@voucha/test-helpers/user-vouch-vote-stats-admission'
import type { PrivateUser } from '@services/users/types'
import { getUserVouchElectionById } from './get-election.mts'
import { getUserVouchElectionVote } from './votes-get.mts'
import { upsertUserVouchElectionVotes } from './votes-upsert.mts'
import type { ElectionVoteScore } from '../shared/index.mts'

describe('votes-upsert', () => {
  let voter: PrivateUser

  beforeAll(async () => {
    voter = await createTestUser()
  })

  it('liking a user leaves follow and mute relations alone', async () => {
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)

    await withOwnedVouchStats(target.id, () =>
      upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: 1 }]),
    )

    const election = await waitForUpdatedVouchStats(target.id, { up: 1, down: 0 })
    expect(election?.votes_count_up).toBe(1)
    expect(election?.votes_count_down).toBe(0)
    expect(election?.votes_score_net).toBe(1)

    const vote = await getUserVouchElectionVote(voter.id, target.id)
    expect(vote?.choice).toBe('like')

    expect(await getFollowExists(voter.id, target.id)).toBe(true)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(0)
  }, 30_000)

  it('disavowing a user (-2) auto-mutes and soft-deletes the existing follow', async () => {
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    expect(await getFollowExists(voter.id, target.id)).toBe(true)

    await withOwnedVouchStats(target.id, () =>
      upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: -2 }]),
    )

    const election = await waitForUpdatedVouchStats(target.id, { up: 0, down: 1 })
    expect(election?.votes_count_up).toBe(0)
    expect(election?.votes_count_down).toBe(1)
    expect(election?.votes_score_net).toBe(-2)

    const vote = await getUserVouchElectionVote(voter.id, target.id)
    expect(vote?.choice).toBe('disavow')

    expect(await getFollowExists(voter.id, target.id)).toBe(false)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)
  }, 30_000)

  it('retracting a disavow (0) does not unmute or restore the follow', async () => {
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)

    await withOwnedVouchStats(target.id, () =>
      upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: -2 }]),
    )
    await waitForUpdatedVouchStats(target.id, { up: 0, down: 1 })
    expect(await getFollowExists(voter.id, target.id)).toBe(false)

    await withOwnedVouchStats(target.id, () =>
      upsertUserVouchElectionVotes(voter.id, [
        { entityId: target.id, score: 0 as ElectionVoteScore },
      ]),
    )
    await waitForUpdatedVouchStats(target.id, { up: 0, down: 0 })

    const vote = await getUserVouchElectionVote(voter.id, target.id)
    expect(vote?.choice).toBe('neutral')

    expect(await getFollowExists(voter.id, target.id)).toBe(false)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)
  }, 30_000)

  it('clearing a disavow keeps its committed mute and unfollow side effects', async () => {
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)

    await withOwnedVouchStats(target.id, async () => {
      await upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: -2 }])
      await upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: null }])
    })

    await expect(getUserVouchElectionVote(voter.id, target.id)).resolves.toBeNull()
    expect(await getFollowExists(voter.id, target.id)).toBe(false)
    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)
  }, 30_000)

  it('keeps the last semantic choice for duplicate target votes', async () => {
    const target = await createTestUser()

    const result = await withOwnedVouchStats(target.id, () =>
      upsertUserVouchElectionVotes(voter.id, [
        { entityId: target.id, score: 1 },
        { entityId: target.id, score: -2 as ElectionVoteScore },
      ]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.score).toBe(-2)

    const vote = await getUserVouchElectionVote(voter.id, target.id)
    expect(vote?.choice).toBe('disavow')

    const election = await waitForUpdatedVouchStats(target.id, { up: 0, down: 1 })
    expect(election?.votes_count_up).toBe(0)
    expect(election?.votes_count_down).toBe(1)
    expect(election?.votes_score_net).toBe(-2)

    const muteRelations = await getEntityRelation('relation__user__mute__user', voter.id, target.id)
    expect(muteRelations).toHaveLength(1)
  }, 30_000)

  it('completes with a user agent while its transaction holds the final write-pool client', async () => {
    const target = await createTestUser()
    await withOwnedVouchStats(target.id, async () => {
      let upsert: Promise<unknown> | undefined
      const failures: unknown[] = []
      try {
        await withOnlyOneWritePoolClientAvailable(async () => {
          upsert = upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: 1 }], {
            ipAddress: null,
            deviceId: null,
            sessionId: null,
            userAgent: `pool-saturation-${crypto.randomUUID()}`,
          })

          await expect(withDeadline(upsert, 5_000)).resolves.toBeDefined()
        })
      } catch (err) {
        failures.push(err)
      } finally {
        // The pool helper has released its held clients before this actual action drain.
        if (upsert) await upsert.catch(err => failures.push(err))
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length > 1) throw new AggregateError(failures, 'Vote and cleanup failed')
    })
  }, 30_000)

  async function waitForUpdatedVouchStats(userId: string, expected: { up: number; down: number }) {
    const latest = await getUserVouchElectionById(userId)
    expect({ up: latest?.votes_count_up, down: latest?.votes_count_down }).toEqual(expected)
    return latest
  }
})

function withDeadline<Result>(promise: Promise<Result>, timeoutMs: number): Promise<Result> {
  const signal = AbortSignal.timeout(timeoutMs)
  const timedOut = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new Error(`User-vouch vote did not complete within ${timeoutMs}ms`)),
      { once: true },
    )
  })
  return Promise.race([promise, timedOut])
}
