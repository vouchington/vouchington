import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'
import { completeOAuthAuthorization } from '../authorization-completion.mts'

describe('OAuth authorization completion state guards', () => {
  it('returns pending while exchange is unfinished', async () => {
    const { deviceId, sessionId, completionToken } = completionCredentials()
    const flowId = await insertOwnedAuthorization({
      status: 'callback_received',
      deviceId,
      sessionId,
      completionToken,
      callbackReceivedAt: new Date(),
    })

    await expect(
      completeOAuthAuthorization({
        flowId,
        completionToken,
        completionTokenSource: 'cookie',
        deviceId,
        sessionId,
      }),
    ).resolves.toEqual({ status: 'pending' })
  })

  it('rejects missing, expired, rejected, and wrong-session completions', async () => {
    const { deviceId, sessionId, completionToken } = completionCredentials()

    await expect(
      completeOAuthAuthorization({
        flowId: randomUUID(),
        completionToken,
        completionTokenSource: 'cookie',
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 404 })

    const wrongSessionCredentials = completionCredentials()
    const wrongSessionId = await insertOwnedAuthorization({
      status: 'callback_received',
      deviceId: wrongSessionCredentials.deviceId,
      sessionId: wrongSessionCredentials.sessionId,
      completionToken: wrongSessionCredentials.completionToken,
      callbackReceivedAt: new Date(),
    })
    await expect(
      completeOAuthAuthorization({
        flowId: wrongSessionId,
        completionToken: wrongSessionCredentials.completionToken,
        completionTokenSource: 'cookie',
        deviceId: wrongSessionCredentials.deviceId,
        sessionId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 })

    const rejectedId = await insertOwnedAuthorization({
      status: 'rejected',
      deviceId,
      sessionId,
      completionToken,
    })
    await expect(
      completeOAuthAuthorization({
        flowId: rejectedId,
        completionToken,
        completionTokenSource: 'cookie',
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 401 })

    const expiredId = await insertOwnedAuthorization({
      status: 'expired',
      deviceId,
      sessionId,
      completionToken,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(
      completeOAuthAuthorization({
        flowId: expiredId,
        completionToken,
        completionTokenSource: 'cookie',
        deviceId,
        sessionId,
      }),
    ).rejects.toMatchObject({ status: 410 })

    const elapsedCredentials = completionCredentials()
    const elapsedId = await insertOwnedAuthorization({
      status: 'callback_received',
      deviceId: elapsedCredentials.deviceId,
      sessionId: elapsedCredentials.sessionId,
      completionToken: elapsedCredentials.completionToken,
      callbackCodeCiphertext: 'expired-callback-code',
      completionTokenCiphertext: 'expired-completion-token',
      callbackReceivedAt: new Date(),
      exchangeClaimId: randomUUID(),
      expiresAt: new Date(Date.now() - 1_000),
    })
    await expect(
      completeOAuthAuthorization({
        flowId: elapsedId,
        completionToken: elapsedCredentials.completionToken,
        completionTokenSource: 'cookie',
        deviceId: elapsedCredentials.deviceId,
        sessionId: elapsedCredentials.sessionId,
      }),
    ).rejects.toMatchObject({ status: 410 })
    expect(await getTestOAuthAuthorization(elapsedId)).toMatchObject({
      status: 'expired',
      callback_code_ciphertext: null,
      completion_token_ciphertext: null,
      exchange_claim_id: null,
    })
  })
})

function completionCredentials() {
  return {
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    completionToken: randomBytes(32).toString('base64url'),
  }
}

async function insertOwnedAuthorization(
  options: Parameters<typeof insertTestOAuthAuthorization>[0],
): Promise<string> {
  const flowId = await insertTestOAuthAuthorization(options)
  onTestFinished(async () => {
    await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [flowId] })
  })
  return flowId
}
