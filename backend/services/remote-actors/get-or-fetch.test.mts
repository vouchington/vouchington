import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setTestRemoteActorFetchedAt } from '@voucha/test-helpers'
import { RemoteActorFetchAvailabilityError } from './fetch-remote-actor-document.mts'
import { getRemoteActorByKeyId, getOrFetchRemoteActorByKeyId } from './get-or-fetch.mts'
import {
  fetchWithTimeoutResult,
  makeJsonResponse,
  ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from './test-fixtures.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)
const DAY_MS = 24 * 60 * 60 * 1000

// Backdates a cached row past REMOTE_ACTOR_CACHE_TTL_MS (1 hour) so a lookup treats it as stale.
async function expireCachedRow(actorUri: string): Promise<void> {
  await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * 60 * 60 * 1000))
}

describe('getRemoteActorByKeyId', () => {
  it('returns null when no remote actor is cached for the keyId', async () => {
    expect(
      await getRemoteActorByKeyId(`https://remote.example/users/${randomSuffix()}#main-key`),
    ).toBeNull()
  })
})

describe('getOrFetchRemoteActorByKeyId', () => {
  const fetchWithTimeout = vi.fn<VitestLooseMock>()
  const validateUrl = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  it('fetches, persists, and returns a new remote actor on first sight', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          endpoints: { sharedInbox: 'https://remote.example/inbox' },
          publicKey: {
            id: keyId,
            publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
          },
        }),
      ),
    )

    const row = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

    expect(row.actor_uri).toBe(actorUri)
    expect(row.key_id).toBe(keyId)
    expect(row.inbox_url).toBe(`${actorUri}/inbox`)
    expect(row.shared_inbox_url).toBe('https://remote.example/inbox')
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('returns the cached row on a second lookup without fetching again', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: {
            id: keyId,
            publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
          },
        }),
      ),
    )
    await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

    const second = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

    expect(second.key_id).toBe(keyId)
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('rejects a document whose publicKey.id does not match the requested keyId', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: {
            id: `${actorUri}#other-key`,
            publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
          },
        }),
      ),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/does not match/)
  })

  it('rejects a document whose id does not match the fetched actor URI', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    const spoofedActorUri = `https://remote.example/users/${randomSuffix()}`
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: spoofedActorUri,
          inbox: `${spoofedActorUri}/inbox`,
          publicKey: {
            id: keyId,
            publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
          },
        }),
      ),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/does not match/)
  })

  it('rejects a keyId that is not a valid URI', async () => {
    await expect(
      getOrFetchRemoteActorByKeyId('not-a-uri', { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/valid URI/)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('refetches a cached row older than the fallback cutoff and recovers it in place', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    const staleKeyPem = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM
    const rotatedKeyPem = ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: staleKeyPem },
        }),
      ),
    )
    const original = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    const staleFetchedAt = new Date(Date.now() - 8 * DAY_MS)
    await setTestRemoteActorFetchedAt(actorUri, staleFetchedAt)

    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: rotatedKeyPem },
        }),
      ),
    )
    const refreshed = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

    expect(refreshed.id).toBe(original.id)
    expect(refreshed.public_key_pem).toBe(rotatedKeyPem)
    expect(refreshed.fetched_at.getTime()).toBeGreaterThan(staleFetchedAt.getTime())
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
  })

  it('stops falling back after a failed refresh crosses the maximum stale-key age', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    const cachedKeyPem = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: cachedKeyPem },
        }),
      ),
    )
    await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
    const fallbackFetchedAt = new Date(Date.now() - 6 * DAY_MS)
    await setTestRemoteActorFetchedAt(actorUri, fallbackFetchedAt)

    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse({ error: 'unavailable' }, 502)),
    )
    const fallback = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

    expect(fallback.public_key_pem).toBe(cachedKeyPem)
    expect(fallback.fetched_at).toEqual(fallbackFetchedAt)

    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 8 * DAY_MS))
    const transportCause = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
    const transportError = new TypeError('fetch failed', { cause: transportCause })
    fetchWithTimeout.mockRejectedValueOnce(transportError)

    const cutoffError = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    }).catch((error: unknown) => error)
    expect(cutoffError).toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect((cutoffError as Error).cause).toBe(transportError)
  })

  // Round-10 re-review fix: a 200 response that fails content validation (unlike the transport
  // failure above) must not fall back to the stale cached key — otherwise a server that revoked
  // its key and now serves a broken document would keep having its stale key trusted forever.
  it('rejects, without falling back to the stale key, when a refetch returns a malformed document', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    const cachedKeyPem = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: cachedKeyPem },
        }),
      ),
    )
    await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
    await expireCachedRow(actorUri)

    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse({ id: actorUri, inbox: `${actorUri}/inbox` })),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/publicKey must be a JSON object/)
  })

  it('rethrows when no cached row exists and the fetch fails', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse({ error: 'unavailable' }, 502)),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/fetch failed with status 502/)
  })

  it('rejects, without falling back to the stale key, when a refetch reveals the key rotated away from the requested keyId', async () => {
    const slug = randomSuffix()
    const actorUri = `https://remote.example/users/${slug}`
    const keyId = `${actorUri}#main-key`
    const cachedKeyPem = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem: cachedKeyPem },
        }),
      ),
    )
    await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
    await expireCachedRow(actorUri)

    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: {
            id: `${actorUri}#new-key`,
            publicKeyPem: ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM,
          },
        }),
      ),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/does not match/)
  })
})
