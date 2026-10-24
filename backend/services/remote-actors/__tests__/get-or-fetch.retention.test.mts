import { describe, expect, it, vi } from 'vitest'
import { createTestExpiryWindow, setTestRemoteActorFetchedAt } from '@voucha/test-helpers'
import {
  fetchWithTimeoutResult,
  makeJsonResponse,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from '@voucha/test-helpers/remote-actor-fixtures'
import { cleanupOperationalTombstones } from '../../data-retention/cleanup-operational-tombstones.mts'
import { getRemoteActorByKeyId, getOrFetchRemoteActorByKeyId } from '../get-or-fetch.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('remote actor cache retention', () => {
  it('requires a freshly fetched key after eviction while preserving the actor identity', async () => {
    const window = createTestExpiryWindow()
    const actorUri = `https://remote.example/users/${Math.random().toString(36).slice(2, 10)}`
    const keyId = `${actorUri}#main-key`
    const document = {
      id: actorUri,
      inbox: `${actorUri}/inbox`,
      publicKey: { id: keyId, publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM },
    }
    const fetchWithTimeout = vi.fn<VitestLooseMock>()
    const validateUrl = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeJsonResponse(document)))
    const original = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    await setTestRemoteActorFetchedAt(actorUri, window.firstEligibleDate)
    expect(
      await cleanupOperationalTombstones('remote_actors', {
        batchSize: 1,
        maxBatches: 1,
        now: new Date(window.upperBoundDate.getTime() + 90 * DAY_MS),
        lowerBoundDate: window.lowerBoundDate,
      }),
    ).toMatchObject({ deleted: 1 })
    expect(await getRemoteActorByKeyId(keyId)).toBeNull()

    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse({ id: actorUri, inbox: `${actorUri}/inbox` })),
    )
    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/publicKey must be a JSON object/)
    expect(await getRemoteActorByKeyId(keyId)).toBeNull()

    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeJsonResponse(document)))
    const recovered = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    expect(recovered.id).toBe(original.id)
  })
})
