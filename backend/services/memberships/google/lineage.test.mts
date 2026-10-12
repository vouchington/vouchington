import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getTestGooglePlayTokenAlias,
  linkTestGooglePlayTokenToForeignContext,
  persistTestGooglePlayResolvedLineage,
  persistTestGooglePlayTokenLineage,
} from '@voucha/test-helpers/google-play-memberships-persistence'
import {
  GooglePlayLineageConflictError,
  getLatestKnownGooglePlayPurchaseToken,
  resolveGooglePlayTokenLineage,
  tokenDigest,
  type GooglePlayResolvedLineage,
} from './lineage.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play token lineage', () => {
  it('deduplicates a reported predecessor and preserves its first fetched timestamp on replay', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    const predecessor = `predecessor-${randomUUID()}`
    const rootDigest = tokenDigest(predecessor)
    const persist = (token: string, linkedToken: string | null, fetched: boolean) =>
      persistTestGooglePlayResolvedLineage({
        applicationId,
        resolved: {
          rootToken: predecessor,
          rootDigest,
          currentSubscription: {},
          tokens: [{ token, linkedToken, fetched }],
        },
      })
    const first = `successor-${randomUUID()}`
    const second = `successor-${randomUUID()}`
    await persist(first, predecessor, true)
    const reported = await getTestGooglePlayTokenAlias({ applicationId, digest: rootDigest })
    expect(reported?.fetchedAt).toBeNull()
    await persist(second, predecessor, true)
    const reportedAgain = await getTestGooglePlayTokenAlias({ applicationId, digest: rootDigest })
    expect(reportedAgain?.id).toBe(reported?.id)
    expect(reportedAgain?.fetchedAt).toBeNull()
    expect(
      (await getTestGooglePlayTokenAlias({ applicationId, digest: tokenDigest(first) }))?.linkedId,
    ).toBe(reported?.id)
    expect(
      (await getTestGooglePlayTokenAlias({ applicationId, digest: tokenDigest(second) }))?.linkedId,
    ).toBe(reported?.id)

    await persist(predecessor, null, true)
    const fetched = await getTestGooglePlayTokenAlias({ applicationId, digest: rootDigest })
    expect(fetched?.id).toBe(reported?.id)
    expect(fetched?.fetchedAt).toBeInstanceOf(Date)
    const replay = await persist(predecessor, null, true)
    expect(replay.submittedTokenFirstFetched).toBe(false)
    expect(
      (await getTestGooglePlayTokenAlias({ applicationId, digest: rootDigest }))?.fetchedAt,
    ).toEqual(fetched?.fetchedAt)
  })

  it('keeps a known predecessor link when a later fetch omits the optional link', async () => {
    const applicationId = `ai.voucha.lineage-${randomUUID()}`
    const predecessor = `predecessor-${randomUUID()}`
    const token = `successor-${randomUUID()}`
    const rootDigest = tokenDigest(predecessor)
    await persistTestGooglePlayResolvedLineage({
      applicationId,
      resolved: {
        rootToken: predecessor,
        rootDigest,
        currentSubscription: {},
        tokens: [{ token, linkedToken: predecessor, fetched: true }],
      },
    })
    const before = await getTestGooglePlayTokenAlias({ applicationId, digest: tokenDigest(token) })
    const resolved = await resolveGooglePlayTokenLineage({
      applicationId,
      environment: 'test',
      purchaseToken: token,
      currentSubscription: {},
      client: clientFor(() => ({})),
    })
    expect(resolved.rootDigest).toBe(rootDigest)
    expect(resolved.tokens).toEqual([{ token, linkedToken: null, fetched: true }])
    await expect(
      persistTestGooglePlayResolvedLineage({ applicationId, resolved }),
    ).resolves.toMatchObject({
      submittedTokenFirstFetched: false,
    })
    const after = await getTestGooglePlayTokenAlias({ applicationId, digest: tokenDigest(token) })
    expect(after?.id).toBe(before?.id)
    expect(after?.linkedId).toBe(before?.linkedId)
    expect(after?.fetchedAt).toEqual(before?.fetchedAt)
  })

  it('keeps reported-only aliases out of fetched reads and rejects a predecessor from another context', async () => {
    const predecessor = `predecessor-${randomUUID()}`
    const firstApplicationId = `ai.voucha.lineage-${randomUUID()}`
    const secondApplicationId = `ai.voucha.lineage-${randomUUID()}`
    const makeAlias = (applicationId: string) =>
      persistTestGooglePlayResolvedLineage({
        applicationId,
        resolved: {
          rootToken: predecessor,
          rootDigest: tokenDigest(predecessor),
          currentSubscription: {},
          tokens: [{ token: predecessor, linkedToken: null, fetched: false }],
        },
      })
    await makeAlias(firstApplicationId)
    await makeAlias(secondApplicationId)
    const firstAlias = await getTestGooglePlayTokenAlias({
      applicationId: firstApplicationId,
      digest: tokenDigest(predecessor),
    })
    const secondAlias = await getTestGooglePlayTokenAlias({
      applicationId: secondApplicationId,
      digest: tokenDigest(predecessor),
    })
    expect(firstAlias?.id).not.toBe(secondAlias?.id)
    await expect(
      getLatestKnownGooglePlayPurchaseToken({
        applicationId: firstApplicationId,
        environment: 'test',
        purchaseToken: predecessor,
      }),
    ).resolves.toBeNull()
    await expect(
      linkTestGooglePlayTokenToForeignContext(firstAlias!.id, secondAlias!.id),
    ).rejects.toMatchObject({ code: '23503' })
    expect(
      (
        await getTestGooglePlayTokenAlias({
          applicationId: firstApplicationId,
          digest: tokenDigest(predecessor),
        })
      )?.linkedId,
    ).toBeNull()
  })

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
