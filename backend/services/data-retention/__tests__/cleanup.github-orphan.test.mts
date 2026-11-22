import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createRandomString,
  createTestRetentionWindow,
  getTestPostgresBackendProcessId,
  insertTestOAuthAccount,
  oauthAccountExistsByProviderUserId,
  setOAuthAccountRetentionTime,
} from '@voucha/test-helpers'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { upsertOAuthAccount } from '../../oauth-accounts/upsert.mts'
import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'

describe('GitHub orphan account cleanup', () => {
  // no-mistakes-timeout-reason: shared-database setup and multi-row writes exceed the 5s default in CI
  it('preserves an old orphaned account during its active broker completion', async () => {
    const window = createTestRetentionWindow()
    const activeProviderId = `retained-github-${createRandomString(12)}`
    const unrelatedProviderId = `unrelated-github-${createRandomString(12)}`
    await insertTestOAuthAccount('github', activeProviderId)
    await insertTestOAuthAccount('github', unrelatedProviderId)
    const activeAccountId = await setOAuthAccountRetentionTime(
      'github',
      activeProviderId,
      window.firstEligibleDate,
    )
    await setOAuthAccountRetentionTime('github', unrelatedProviderId, window.secondEligibleDate)
    if (!activeAccountId) throw new Error('Retained GitHub account fixture is missing')
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        githubUserIds: [activeProviderId, unrelatedProviderId],
      })
    })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'github',
      status: 'completion_ready',
      providerUserId: activeProviderId,
      callbackReceivedAt: now,
      completionReadyAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })

    await expect(
      deleteOrphanedOAuthAccountBatch(
        'github_accounts',
        'github_user_id',
        window.upperBoundDate,
        2,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(1)
    await expect(oauthAccountExistsByProviderUserId('github', activeProviderId)).resolves.toBe(true)
    await expect(oauthAccountExistsByProviderUserId('github', unrelatedProviderId)).resolves.toBe(
      false,
    )
    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      github_account_id: activeAccountId,
    })
  }, 30_000)

  it('preserves an authorization completed during orphan cleanup', async () => {
    const window = createTestRetentionWindow()
    const providerUserId = `github-${createRandomString(12)}`
    const authorizationId = v7()
    const claimId = v7()
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({
        authorizationIds: [authorizationId],
        githubUserIds: [providerUserId],
      }),
    )
    await insertTestOAuthAccount('github', providerUserId)
    const accountId = await setOAuthAccountRetentionTime(
      'github',
      providerUserId,
      window.firstEligibleDate,
    )
    if (!accountId) throw new Error('Orphaned GitHub account fixture is missing')
    await insertTestOAuthAuthorization({
      id: authorizationId,
      provider: 'github',
      callbackCodeCiphertext: 'test-callback-ciphertext',
      callbackReceivedAt: new Date(),
      exchangeClaimId: claimId,
    })

    await using callback = await beginTransaction()
    await upsertOAuthAccount('github', providerUserId, null, { login: providerUserId }, undefined, {
      query: callback,
      authorizationId,
      authorizationClaimId: claimId,
    })
    const holderProcessId = await getTestPostgresBackendProcessId(callback)
    await withTestOwnedPostgresWait(
      {
        holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'deleteOrphanedOAuthAccountBatch',
        releaseHolder: () => callback[Symbol.asyncDispose](),
        allowUnblockedCompletion: true,
      },
      async waitForLock => {
        const cleanup = deleteOrphanedOAuthAccountBatch(
          'github_accounts',
          'github_user_id',
          window.upperBoundDate,
          1,
          window.lowerBoundDate,
        )
        // If cleanup waits, its DELETE still uses the earlier snapshot when the callback commits.
        await waitForLock(cleanup)
        await callback.commit()
        await cleanup
      },
    )

    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toMatchObject({
      status: 'completion_ready',
      github_account_id: accountId,
    })
    await expect(oauthAccountExistsByProviderUserId('github', providerUserId)).resolves.toBe(true)
  })
})
