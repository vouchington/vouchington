import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { startPausedTestOAuthCodeLock } from '@voucha/test-helpers/entities/oauth-code-lock'
import { assignTestOAuthClientOwner } from '@voucha/test-helpers/entities/oauth-client-management'
import { getTestOAuthCredentialStorage } from '@voucha/test-helpers/entities/oauth-authorization-server'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import {
  createTestApprovedOAuthAuthorization,
  TEST_OAUTH_RESOURCE,
  TEST_OAUTH_SCOPE,
} from './test-support.mts'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
} from './index.mts'

describe('OAuth participant lifecycle lock concurrency', () => {
  it('lets distinct grant subjects exchange codes concurrently under one app owner', async () => {
    const [owner, firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const first = await createTestApprovedOAuthAuthorization(firstUser)
    await assignTestOAuthClientOwner(first.client.client_id, owner.id)
    const second = await approveCodeForExistingClient(
      secondUser.id,
      first.client.client_id,
      first.redirectUri,
    )
    const firstCodeLock = await startPausedTestOAuthCodeLock(first.code)
    let secondCodeLock: Awaited<ReturnType<typeof startPausedTestOAuthCodeLock>> | undefined
    let firstExchange: ReturnType<typeof exchangeOAuthAuthorizationCode> | undefined
    let secondExchange: ReturnType<typeof exchangeOAuthAuthorizationCode> | undefined
    try {
      secondCodeLock = await startPausedTestOAuthCodeLock(second.code)
      firstExchange = exchangeOAuthAuthorizationCode({
        clientId: first.client.client_id,
        code: first.code,
        codeVerifier: first.verifier,
        redirectUri: first.redirectUri,
      })
      void firstExchange.catch(() => undefined)
      await waitForTestPostgresLockWaiter(
        firstCodeLock.holderProcessId,
        '/* lockAuthorizationCode */',
      )
      secondExchange = exchangeOAuthAuthorizationCode({
        clientId: first.client.client_id,
        code: second.code,
        codeVerifier: second.verifier,
        redirectUri: first.redirectUri,
      })
      void secondExchange.catch(() => undefined)
      await waitForTestPostgresLockWaiter(
        secondCodeLock.holderProcessId,
        '/* lockAuthorizationCode */',
      )
      secondCodeLock.release()
      const secondTokens = await secondExchange
      expect(secondTokens.access_token).toMatch(/^voucha_access_/)
      expect(await getTestOAuthCredentialStorage({ authorizationCode: first.code })).toMatchObject({
        authorizationCodeConsumed: false,
      })
      firstCodeLock.release()
      const firstTokens = await firstExchange
      expect(firstTokens.access_token).toMatch(/^voucha_access_/)
    } finally {
      firstCodeLock.release()
      secondCodeLock?.release()
      await Promise.allSettled([
        firstCodeLock.completed,
        secondCodeLock?.completed,
        firstExchange,
        secondExchange,
      ])
    }
  })
})

async function approveCodeForExistingClient(userId: string, clientId: string, redirectUri: string) {
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const request = await beginOAuthAuthorizationRequest({
    clientId,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    deviceId,
    redirectUri,
    resource: TEST_OAUTH_RESOURCE,
    responseType: 'code',
    scope: TEST_OAUTH_SCOPE,
    sessionId,
    state: randomBytes(16).toString('base64url'),
    userId,
  })
  const approved = await decideOAuthAuthorizationRequest(
    userId,
    request.request_id,
    'approve',
    createOAuthBrowserBindingHash(deviceId, sessionId),
  )
  const code = new URL(approved.redirect_uri).searchParams.get('code')
  if (!code) throw new Error('Second authorization code was not returned')
  return { code, verifier }
}
