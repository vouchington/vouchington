import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import type { QueryExecutor } from '@data-stores/psql'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { replaceTestOAuthRedirectUrisWhileWaiting } from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createTestApprovedOAuthAuthorization,
  createTestPendingOAuthAuthorization,
  randomTestOAuthRedirectUri,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { decideOAuthAuthorizationRequest, exchangeOAuthAuthorizationCode } from './index.mts'

type TestUser = Awaited<ReturnType<typeof createTestUserDirect>>

describe('OAuth redirect URI replacement racing consent and code exchange', () => {
  let owner: TestUser

  beforeAll(async () => {
    owner = await createTestUserDirect()
  })

  it('refuses a consent decision that waited on a removal of its redirect URI', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: pending.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* lockAuthorizationRequest */',
        start: () =>
          decideOAuthAuthorizationRequest(
            owner.id,
            pending.requestId,
            'approve',
            pending.bindingHash,
          ),
      }),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('returns a consent decision that waited on a retained redirect URI', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)

    const decision = await replaceTestOAuthRedirectUrisWhileWaiting({
      clientId: pending.client.client_id,
      redirectUris: [pending.redirectUri, randomTestOAuthRedirectUri()],
      waiterQueryMarker: '/* lockAuthorizationRequest */',
      start: () =>
        decideOAuthAuthorizationRequest(
          owner.id,
          pending.requestId,
          'approve',
          pending.bindingHash,
        ),
    })

    expect(new URL(decision.redirect_uri).searchParams.get('code')).toBeTruthy()
  })

  it('refuses a code exchange that waited on a removal of its redirect URI', async () => {
    const flow = await createTestApprovedOAuthAuthorization(owner)

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: flow.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* authenticateLockedOAuthClient */',
        start: () =>
          exchangeOAuthAuthorizationCode({
            clientId: flow.client.client_id,
            code: flow.code,
            codeVerifier: flow.verifier,
            redirectUri: flow.redirectUri,
          }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('handles an operation rejected before it can wait on the client lock', async () => {
    const pending = await createTestPendingOAuthAuthorization(owner)
    const operationFailure = new Error('operation failed before client lock')

    await expect(
      replaceTestOAuthRedirectUrisWhileWaiting({
        clientId: pending.client.client_id,
        redirectUris: [randomTestOAuthRedirectUri()],
        waiterQueryMarker: '/* lockAuthorizationRequest */',
        start: () => Promise.reject(operationFailure),
      }),
    ).rejects.toMatchObject({
      message: 'Operation did not wait for the test lock: /* lockAuthorizationRequest */',
      cause: operationFailure,
    })
  })
})

describe('PostgreSQL lock observation cancellation ownership', () => {
  it('does not start a query when cancellation already has an original cause', async () => {
    const cancellation = new Error('operation already rejected')
    const controller = new AbortController()
    controller.abort(cancellation)
    let calls = 0
    const query: QueryExecutor = async () => {
      calls++
      throw new Error('query must not start')
    }

    await expect(
      waitForTestPostgresLockWaiter(1, 'owned-marker', query, undefined, controller.signal),
    ).rejects.toMatchObject({
      message: 'Operation did not wait for the test lock: owned-marker',
      cause: cancellation,
    })
    expect(calls).toBe(0)
  })

  it('drains the current query and retains both independent failures before rejecting', async () => {
    const cancellation = new Error('operation rejected during observation')
    const queryFailure = new Error('observer query failed independently')
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>()
    const queryResult = Promise.withResolvers<never>()
    let calls = 0
    const query: QueryExecutor = () => {
      calls++
      entered.resolve()
      return queryResult.promise
    }
    let settled = false
    // Observe rejection immediately, including if an incorrect implementation rejects early.
    const outcome = waitForTestPostgresLockWaiter(
      1,
      'owned-marker',
      query,
      undefined,
      controller.signal,
    ).then(
      () => {
        settled = true
        return undefined
      },
      (err: unknown) => {
        settled = true
        return err
      },
    )
    let rejection: unknown
    try {
      await entered.promise
      controller.abort(cancellation)
      expect(settled).toBe(false)
      expect(calls).toBe(1)
    } finally {
      queryResult.reject(queryFailure)
      rejection = await outcome
    }
    expect(rejection).toMatchObject({
      message: 'Operation did not wait for the test lock: owned-marker',
      cause: { error: queryFailure, suppressed: cancellation },
    })
    expect(calls).toBe(1)
  })
})
