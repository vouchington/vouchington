import { randomInt, randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { vi } from 'vitest'
import { VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB } from '../queues/background/enqueues/vote-aggregation-jobs.mts'
import { background } from '../queues/background/queues.mts'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from '../services/oauth-accounts/connect.mts'
import { upsertOAuthAccount } from '../services/oauth-accounts/upsert.mts'
import { deleteTestOAuthAuthorizationFixtures } from './entities/oauth-authorization-fixture-cleanup.mts'
import { getTestUserRaw, setTestUserVoteWeightRecalculatedAt } from './entities/users-lifecycle.mts'
import { createVoteWeightDispatchUserAt } from './vote-weight-dispatch.mts'

/** Rejects the recalculation enqueue for one owned user; every other add reaches the real queue. */
export function failOwnedVoteWeightEnqueue(userId: string, error: unknown) {
  const realAdd = background.add
  return vi.spyOn(background, 'add').mockImplementation((name, data, opts) => {
    if (
      name === VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB.name &&
      (data as { userId?: string }).userId === userId
    )
      return Promise.reject(error)
    return realAdd.call(background, name, data, opts)
  })
}

/** An owned future UUID range isolates a bounded dirty-marker page in the shared test database. */
export async function createFailedOAuthVoteWeightEnqueueFixture() {
  const at = new Date(Date.UTC(2080, 0, 1) + randomInt(0, 30_000_000))
  const userId = await createVoteWeightDispatchUserAt(at)
  const afterId = v7({ msecs: at.getTime() - 1 })
  const providerUserId = `github-vote-weight-dirty-${randomUUID()}`
  try {
    await setTestUserVoteWeightRecalculatedAt(userId, new Date())
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    await connectOAuthAccountToUser('github', userId, providerUserId)
    const failure = failOwnedVoteWeightEnqueue(
      userId,
      new Error('test vote-weight enqueue failure'),
    )
    try {
      await runOAuthAccountConnectionPostCommitEffects(userId)
    } finally {
      failure.mockRestore()
    }
    return {
      userId,
      afterId,
      providerUserId,
      getUser: () => getTestUserRaw(userId),
      cleanup: () =>
        deleteTestOAuthAuthorizationFixtures({
          githubUserIds: [providerUserId],
          userIds: [userId],
        }),
    }
  } catch (err) {
    await deleteTestOAuthAuthorizationFixtures({
      githubUserIds: [providerUserId],
      userIds: [userId],
    })
    throw err
  }
}
