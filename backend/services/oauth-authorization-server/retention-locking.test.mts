import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import {
  getTestOAuthRetentionFamilyId,
  getTestOAuthRetentionRowCounts,
  lockTestOAuthRetentionRemainingAccessToken,
  lockTestOAuthRetentionPredecessor,
  prepareTestOAuthRetentionRows,
  setTestOAuthRefreshRootAfterReplacement,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { exchangeOAuthAuthorizationCode, exchangeOAuthRefreshToken } from './index.mts'
import {
  deleteExpiredOAuthRetentionTokens,
  lockExpiredOAuthRetentionFamilies,
} from './retention-tokens.mts'
import { deleteExpiredOAuthAuthorizationServerArtifacts } from './retention.mts'

describe('OAuth retention replacement-chain locking', () => {
  it('limits the family page before skipping a held first family', async () => {
    const owner = await createTestUserDirect()
    const expiryWindow = createTestExpiryWindow()
    const expiry = expiryWindow.firstEligibleDate
    const window = { lowerBoundDate: expiry, now: expiry }
    const familyIds: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const flow = await createTestApprovedOAuthAuthorization(owner)
      await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      await prepareTestOAuthRetentionRows(flow.client.client_id, {
        expiresAt: expiry,
        childExpiresAt: expiryWindow.afterUpperBoundDate,
        only: 'family',
      })
      familyIds.push(await getTestOAuthRetentionFamilyId(flow.client.client_id))
    }

    await using holder = await beginTransaction()
    let released = false
    onTestFinished(async () => {
      if (!released) await holder.rollback()
    })
    const firstPage = await lockExpiredOAuthRetentionFamilies(holder, window, 1)
    expect(firstPage).toHaveLength(1)
    expect(familyIds).toContain(firstPage[0])
    await using contender = await beginTransaction()
    expect(await lockExpiredOAuthRetentionFamilies(contender, window, 1)).toEqual([])
    expect(
      await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
        lowerBoundDate: expiry,
        now: expiry,
        maxBatches: 1,
      }),
    ).toEqual({ deleted: 0, hasMore: true })
    await holder.rollback()
    released = true
    expect(await lockExpiredOAuthRetentionFamilies(contender, window, 1)).toEqual(firstPage)
    await contender.rollback()
  })

  it('locks only the globally selected child when several families have children', async () => {
    const owner = await createTestUserDirect()
    const window = createTestExpiryWindow()
    const familyIds: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const flow = await createTestApprovedOAuthAuthorization(owner)
      await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      await prepareTestOAuthRetentionRows(flow.client.client_id, {
        expiresAt: window.firstEligibleDate,
        childExpiresAt: window.afterUpperBoundDate,
        only: 'family',
      })
      familyIds.push(await getTestOAuthRetentionFamilyId(flow.client.client_id))
    }

    await using deleting = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(
        deleting,
        'oauth_access_tokens',
        window,
        1,
        familyIds,
        false,
      ),
    ).toBe(1)
    await using observer = await beginTransaction()
    expect(await lockTestOAuthRetentionRemainingAccessToken(familyIds, deleting, observer)).toBe(1)
    await observer.rollback()
    await deleting.commit()
  })

  it('retains a replacement while its predecessor is locked, then drains the chain after release', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const tokens = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const next = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: tokens.refresh_token,
    })
    await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: next.refresh_token,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.firstEligibleDate,
      only: 'family',
    })
    await using predecessor = await beginTransaction()
    let released = false
    onTestFinished(async () => {
      if (!released) await predecessor.rollback()
    })
    // Completion of this lock acquisition is the concurrency boundary; no timing assumption.
    await lockTestOAuthRetentionPredecessor(flow.client.client_id, predecessor)
    await using skipped = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(
        skipped,
        'oauth_refresh_tokens',
        window,
        3,
        await lockExpiredOAuthRetentionFamilies(skipped, window, 3),
      ),
    ).toBe(0)
    await skipped.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(3)
    await predecessor.rollback()
    released = true
    await using resumed = await beginTransaction()
    expect(
      await deleteExpiredOAuthRetentionTokens(
        resumed,
        'oauth_refresh_tokens',
        window,
        3,
        await lockExpiredOAuthRetentionFamilies(resumed, window, 3),
      ),
    ).toBe(3)
    await resumed.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(0)
  })

  it('drains a locked three-token refresh page in one bounded delete', async () => {
    const owner = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(owner)
    const original = await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const first = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: original.refresh_token,
    })
    await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: first.refresh_token,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.afterUpperBoundDate,
      only: 'family',
    })

    await using removing = await beginTransaction()
    const familyIds = await lockExpiredOAuthRetentionFamilies(removing, window, 3)
    const pageLocked = Promise.withResolvers<void>()
    const continueDelete = Promise.withResolvers<void>()
    const observed = new Proxy(removing, {
      async apply(target, thisArg, args) {
        const result = await Reflect.apply(target, thisArg, args)
        if (
          typeof args[0] === 'string' &&
          args[0].includes('lockOAuthRetentionFamilyRefreshPage')
        ) {
          pageLocked.resolve()
          await continueDelete.promise
        }
        return result
      },
    })
    const deletion = deleteExpiredOAuthRetentionTokens(
      observed,
      'oauth_refresh_tokens',
      window,
      3,
      familyIds,
      false,
    )
    try {
      await pageLocked.promise
      await using observer = await beginTransaction()
      await expect(
        lockTestOAuthRetentionPredecessor(flow.client.client_id, observer, 'key-share-nowait'),
      ).rejects.toMatchObject({ code: '55P03' })
      await observer.rollback()
    } finally {
      continueDelete.resolve()
    }
    expect(await deletion).toBe(3)
    await removing.commit()
    expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(0)
  })

  it.each(['expired-family', 'own-expiry'] as const)(
    'pages refresh roots before lower UUID replacements for %s cleanup',
    async mode => {
      const owner = await createTestUserDirect()
      const flow = await createTestApprovedOAuthAuthorization(owner)
      const tokens = await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      await exchangeOAuthRefreshToken({
        clientId: flow.client.client_id,
        refreshToken: tokens.refresh_token,
      })
      const window = createTestExpiryWindow()
      await prepareTestOAuthRetentionRows(flow.client.client_id, {
        expiresAt:
          mode === 'expired-family' ? window.firstEligibleDate : window.afterUpperBoundDate,
        childExpiresAt: window.firstEligibleDate,
        only: 'family',
      })
      const { rootId, replacementId } = await setTestOAuthRefreshRootAfterReplacement(
        flow.client.client_id,
      )
      expect(rootId.localeCompare(replacementId)).toBeGreaterThan(0)

      for (const remaining of [1, 0]) {
        await using removing = await beginTransaction()
        const familyIds =
          mode === 'expired-family'
            ? await lockExpiredOAuthRetentionFamilies(removing, window, 1)
            : []
        expect(
          await deleteExpiredOAuthRetentionTokens(
            removing,
            'oauth_refresh_tokens',
            window,
            1,
            familyIds,
            mode === 'own-expiry',
          ),
        ).toBe(1)
        await removing.commit()
        expect((await getTestOAuthRetentionRowCounts(flow.client.client_id)).refresh).toBe(
          remaining,
        )
      }
    },
  )
})
