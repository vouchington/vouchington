import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { persistTestGooglePlayTokenLineage } from '@voucha/test-helpers/google-play-memberships-persistence'
import {
  GooglePlayLineageConflictError,
  resolveGooglePlayTokenLineage,
  tokenDigest,
  type GooglePlayResolvedLineage,
} from './lineage.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play token lineage', () => {
  it('uses a durable alias when an expired purchase predecessor is no longer fetchable', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    const expiredToken = `expired-${randomUUID()}`
    const rootDigest = `root-${randomUUID()}`
    await persistTestGooglePlayTokenLineage({ applicationId, rootDigest, token: expiredToken })
    const currentToken = `current-${randomUUID()}`
    const calls: string[] = []

    const resolved = await resolveGooglePlayTokenLineage({
      applicationId,
      environment: 'test',
      purchaseToken: currentToken,
      client: clientFor(token => {
        calls.push(token)
        return { outOfAppPurchaseContext: { expiredPurchaseToken: expiredToken } }
      }),
    })

    expect(calls).toEqual([currentToken])
    expect(resolved).toMatchObject({
      rootToken: expiredToken,
      rootDigest,
      tokens: [{ token: currentToken, linkedToken: expiredToken }],
    })
  })

  it('stops before fetching a linked token with a known canonical root', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    const knownToken = `known-${randomUUID()}`
    const rootDigest = `root-${randomUUID()}`
    await persistTestGooglePlayTokenLineage({ applicationId, rootDigest, token: knownToken })
    const currentToken = `current-${randomUUID()}`
    const calls: string[] = []

    const resolved = await resolveGooglePlayTokenLineage({
      applicationId,
      environment: 'test',
      purchaseToken: currentToken,
      client: clientFor(token => {
        calls.push(token)
        return { linkedPurchaseToken: knownToken }
      }),
    })

    expect(calls).toEqual([currentToken])
    expect(resolved).toMatchObject({ rootToken: knownToken, rootDigest })
  })

  it.each([
    { status: 404, reason: null },
    { status: 410, reason: null },
    { status: 400, reason: 'subscriptionExpired' },
  ])(
    'uses an unavailable linked predecessor as the lineage boundary ($status $reason)',
    async ({ status, reason }) => {
      const applicationId = `ai.voucha.lineage-${randomUUID()}`
      const currentToken = `current-${randomUUID()}`
      const unavailableToken = `expired-${randomUUID()}`
      const calls: string[] = []

      const resolved = await resolveGooglePlayTokenLineage({
        applicationId,
        environment: 'test',
        purchaseToken: currentToken,
        client: clientFor(token => {
          calls.push(token)
          if (token === unavailableToken)
            throw new GooglePlaySubscriptionLookupError(status, token, reason)
          return { linkedPurchaseToken: unavailableToken }
        }),
      })

      expect(calls).toEqual([currentToken, unavailableToken])
      expect(resolved).toMatchObject({
        rootToken: unavailableToken,
        rootDigest: tokenDigest(unavailableToken),
        tokens: [
          { token: currentToken, linkedToken: unavailableToken },
          { token: unavailableToken, linkedToken: null },
        ],
      })
    },
  )

  it('rejects aliases already assigned to another canonical lineage', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    const token = `token-${randomUUID()}`
    await persistTestGooglePlayTokenLineage({
      applicationId,
      rootDigest: `root-${randomUUID()}`,
      token,
    })
    await expect(
      persistTestGooglePlayTokenLineage({
        applicationId,
        rootDigest: `different-root-${randomUUID()}`,
        token,
      }),
    ).rejects.toBeInstanceOf(GooglePlayLineageConflictError)
  })

  it('bounds an unbroken linked-token chain', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    let calls = 0

    await expect(
      resolveGooglePlayTokenLineage({
        applicationId,
        environment: 'test',
        purchaseToken: `token-${randomUUID()}`,
        client: clientFor(token => {
          calls += 1
          return { linkedPurchaseToken: `${token}-next` }
        }),
      }),
    ).rejects.toThrow('Google Play linked purchase-token chain exceeded 100')

    expect(calls).toBe(100)
  })
})

function clientFor(
  getSubscription: (token: string) => GooglePlayResolvedLineage['currentSubscription'],
): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async ({ purchaseToken }) => getSubscription(purchaseToken),
    acknowledgeSubscription: async () => undefined,
  }
}
