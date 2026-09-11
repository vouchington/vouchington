import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsafeUrlError } from 'ssrf-guard/node'
import { setTestRemoteActorFetchedAt } from '@voucha/test-helpers'
import { RemoteActorFetchAvailabilityError } from './fetch-remote-actor-document.mts'
import { getOrFetchRemoteActorByKeyId } from './get-or-fetch.mts'
import {
  fetchWithTimeoutResult,
  makeJsonResponse,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from './test-fixtures.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const VALID_PUBLIC_KEY_PEM = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM

function makeOversizedResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_001))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

function makeInterruptedBodyResponse(error: Error): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{'))
      controller.error(error)
    },
  })
  return new Response(stream, { status: 200 })
}

async function cacheRemoteActor(
  fetchWithTimeout: ReturnType<typeof vi.fn<VitestLooseMock>>,
  validateUrl: ReturnType<typeof vi.fn<VitestLooseMock>>,
): Promise<{ actorUri: string; keyId: string }> {
  const actorUri = `https://remote.example/users/${Math.random().toString(36).slice(2, 10)}`
  const keyId = `${actorUri}#main-key`
  fetchWithTimeout.mockResolvedValueOnce(
    fetchWithTimeoutResult(
      makeJsonResponse({
        id: actorUri,
        inbox: `${actorUri}/inbox`,
        publicKey: { id: keyId, publicKeyPem: VALID_PUBLIC_KEY_PEM },
      }),
    ),
  )
  await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
  return { actorUri, keyId }
}

describe('remote actor stale-key fail-closed policy', () => {
  const fetchWithTimeout = vi.fn<VitestLooseMock>()
  const validateUrl = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  it('uses the same availability failure below and at the exact seven-day cutoff', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    const transportCause = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
    const transportError = new TypeError('fetch failed', { cause: transportCause })
    const belowCutoff = new Date(Date.now() - 7 * DAY_MS + 60_000)
    await setTestRemoteActorFetchedAt(actorUri, belowCutoff)
    fetchWithTimeout.mockRejectedValueOnce(transportError)

    const fallback = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    expect(fallback.fetched_at).toEqual(belowCutoff)

    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 7 * DAY_MS))
    fetchWithTimeout.mockRejectedValueOnce(transportError)
    const cutoffError = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    }).catch((error: unknown) => error)

    expect(cutoffError).toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect((cutoffError as Error).cause).toBe(transportError)
  })

  it('bounds DNS validation timeout fallback at the exact seven-day cutoff', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    const validationTimeout = new DOMException('DNS validation timed out', 'AbortError')
    const belowCutoff = new Date(Date.now() - 7 * DAY_MS + 60_000)
    await setTestRemoteActorFetchedAt(actorUri, belowCutoff)
    validateUrl.mockRejectedValueOnce(validationTimeout)

    const fallback = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    expect(fallback.fetched_at).toEqual(belowCutoff)

    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 7 * DAY_MS))
    validateUrl.mockRejectedValueOnce(validationTimeout)
    const cutoffError = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    }).catch((error: unknown) => error)

    expect(cutoffError).toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect((cutoffError as Error).cause).toBe(validationTimeout)
  })

  it('bounds DNS resolver failure fallback at the exact seven-day cutoff', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    const resolverError = Object.assign(new Error('temporary DNS failure'), { code: 'EAI_AGAIN' })
    const belowCutoff = new Date(Date.now() - 7 * DAY_MS + 60_000)
    await setTestRemoteActorFetchedAt(actorUri, belowCutoff)
    validateUrl.mockRejectedValueOnce(resolverError)

    const fallback = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    expect(fallback.fetched_at).toEqual(belowCutoff)

    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 7 * DAY_MS))
    validateUrl.mockRejectedValueOnce(resolverError)
    const cutoffError = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    }).catch((error: unknown) => error)

    expect(cutoffError).toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect((cutoffError as Error).cause).toBe(resolverError)
  })

  it('does not fall back when URL validation rejects an unsafe address', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * DAY_MS))
    validateUrl.mockRejectedValueOnce(new UnsafeUrlError(actorUri, 'IP address is private'))

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/Unsafe remote actor URI/)
    expect(fetchWithTimeout).toHaveBeenCalledOnce()
  })

  it('does not fall back when a successful response has no body', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * DAY_MS))
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(new Response(null, { status: 200 })),
    )

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toMatchObject({ code: 'HTTP_NO_BODY' })
  })

  it('does not fall back when a successful response body is oversized', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * DAY_MS))
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeOversizedResponse()))

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toMatchObject({ code: 'HTTP_RESPONSE_SIZE_EXCEEDED' })
  })

  it('bounds interrupted response-body fallback at the exact seven-day cutoff', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    const socketCause = Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' })
    const bodyError = new TypeError('terminated', { cause: socketCause })
    const belowCutoff = new Date(Date.now() - 7 * DAY_MS + 60_000)
    await setTestRemoteActorFetchedAt(actorUri, belowCutoff)
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeInterruptedBodyResponse(bodyError)),
    )

    const fallback = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    })
    expect(fallback.fetched_at).toEqual(belowCutoff)

    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 7 * DAY_MS))
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeInterruptedBodyResponse(bodyError)),
    )
    const cutoffError = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout,
      validateUrl,
    }).catch((error: unknown) => error)

    expect(cutoffError).toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect((cutoffError as Error).cause).toBe(bodyError)
  })

  it('does not fall back for an unexpected TypeError from the fetch implementation', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * DAY_MS))
    const unexpectedError = new TypeError('unexpected fetch implementation failure')
    fetchWithTimeout.mockRejectedValueOnce(unexpectedError)

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toBe(unexpectedError)
  })

  it('does not fall back for a non-transport Undici error', async () => {
    const { actorUri, keyId } = await cacheRemoteActor(fetchWithTimeout, validateUrl)
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * DAY_MS))
    const cause = Object.assign(new Error('invalid dispatcher argument'), {
      code: 'UND_ERR_INVALID_ARG',
    })
    const invalidArgumentError = new TypeError('fetch failed', { cause })
    fetchWithTimeout.mockRejectedValueOnce(invalidArgumentError)

    await expect(
      getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl }),
    ).rejects.toBe(invalidArgumentError)
  })
})
