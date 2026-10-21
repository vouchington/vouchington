import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setTestRemoteActorFetchedAt } from '@voucha/test-helpers'
import type { FetchRemoteActorDocumentDeps } from './fetch-remote-actor-document.mts'
import { getOrFetchRemoteActorByKeyId } from './get-or-fetch.mts'
import {
  fetchWithTimeoutResult,
  makeJsonResponse,
  ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from '@voucha/test-helpers/remote-actor-fixtures'

const CACHE_TTL_MS = 60 * 60 * 1000
const DAY_MS = 24 * CACHE_TTL_MS
const FALLBACK_NOW_MS = Date.parse('2025-01-15T12:34:56.000Z')
const UTC_ANCHORS = [
  ['before January rollover', Date.parse('2024-01-31T23:59:59.999Z')],
  ['after January rollover', Date.parse('2024-02-01T00:00:00.001Z')],
  ['before leap-day rollover', Date.parse('2024-02-29T23:59:59.999Z')],
  ['after leap-day rollover', Date.parse('2024-03-01T00:00:00.001Z')],
  ['before year rollover', Date.parse('2024-12-31T23:59:59.999Z')],
  ['after year rollover', Date.parse('2025-01-01T00:00:00.001Z')],
] as const

const fetchWithTimeout = vi.fn<FetchRemoteActorDocumentDeps['fetchWithTimeout']>()
const validateUrl = vi.fn<FetchRemoteActorDocumentDeps['validateUrl']>()

async function cacheRemoteActor(): Promise<{ actorUri: string; keyId: string }> {
  const actorUri = `https://remote.example/users/${randomUUID()}`
  const keyId = `${actorUri}#main-key`
  fetchWithTimeout.mockResolvedValueOnce(
    fetchWithTimeoutResult(
      makeJsonResponse({
        id: actorUri,
        inbox: `${actorUri}/inbox`,
        publicKey: { id: keyId, publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM },
      }),
    ),
  )
  await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
  return { actorUri, keyId }
}

describe('remote actor cache clock boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchWithTimeout.mockReset()
    validateUrl.mockReset()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  it.each(UTC_ANCHORS)('uses the exact one-hour cutoff %s', async (_label, nowMs) => {
    for (const ageMs of [CACHE_TTL_MS - 1, CACHE_TTL_MS, CACHE_TTL_MS + 1]) {
      const { actorUri, keyId } = await cacheRemoteActor()
      fetchWithTimeout.mockClear()
      await setTestRemoteActorFetchedAt(actorUri, new Date(nowMs - ageMs))

      const isFresh = ageMs < CACHE_TTL_MS
      if (!isFresh) {
        fetchWithTimeout.mockResolvedValueOnce(
          fetchWithTimeoutResult(
            makeJsonResponse({
              id: actorUri,
              inbox: `${actorUri}/inbox`,
              publicKey: { id: keyId, publicKeyPem: ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM },
            }),
          ),
        )
      }
      const now = vi.fn<() => number>(() => nowMs)

      const result = await getOrFetchRemoteActorByKeyId(
        keyId,
        { fetchWithTimeout, validateUrl },
        now,
      )

      expect(now).toHaveBeenCalledOnce()
      expect(fetchWithTimeout).toHaveBeenCalledTimes(isFresh ? 0 : 1)
      expect(result.public_key_pem).toBe(
        isFresh ? VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM : ROTATED_REMOTE_ACTOR_PUBLIC_KEY_PEM,
      )
    }
  })

  it('rejects a non-finite clock value before fetching', async () => {
    const { actorUri, keyId } = await cacheRemoteActor()
    fetchWithTimeout.mockClear()
    await setTestRemoteActorFetchedAt(actorUri, new Date(FALLBACK_NOW_MS - 2 * DAY_MS))
    const now = vi.fn<() => number>(() => Number.NaN)

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }, now),
    ).rejects.toThrow('finite timestamp')
    expect(now).toHaveBeenCalledOnce()
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })
})
