import { randomInt, randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from '../services/oauth-accounts/connect.mts'
import { upsertOAuthAccount } from '../services/oauth-accounts/upsert.mts'
import { deleteTestOAuthAuthorizationFixtures } from './entities/oauth-authorization-fixture-cleanup.mts'
import { getTestUserRaw, setTestUserVoteWeightRecalculatedAt } from './entities/users-lifecycle.mts'
import { createVoteWeightDispatchUserAt } from './vote-weight-dispatch.mts'

/** An owned future UUID range isolates a bounded dirty-marker page in the shared test database. */
export async function createFailedOAuthVoteWeightEnqueueFixture() {
  const at = new Date(Date.UTC(2080, 0, 1) + randomInt(0, 30_000_000))
  const userId = await createVoteWeightDispatchUserAt(at)
  const afterId = v7({ msecs: at.getTime() - 1 })
  const providerUserId = `github-vote-weight-dirty-${randomUUID()}`
  const reportedErrors: Error[] = []
  try {
    await setTestUserVoteWeightRecalculatedAt(userId, new Date())
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    await connectOAuthAccountToUser('github', userId, providerUserId)
    await runOAuthAccountConnectionPostCommitEffects(userId, {
      enqueueVoteWeightRecalculation: async () => {
        throw new Error('test vote-weight enqueue failure')
      },
      invalidateVerifiedEmail: async () => 0,
      reportError: error => {
        reportedErrors.push(error)
      },
    })
    return {
      userId,
      afterId,
      providerUserId,
      reportedErrors,
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
