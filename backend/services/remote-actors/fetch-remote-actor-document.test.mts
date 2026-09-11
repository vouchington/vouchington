import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsafeUrlError } from 'ssrf-guard/node'
import {
  fetchRemoteActorDocument,
  RemoteActorFetchAvailabilityError,
} from './fetch-remote-actor-document.mts'
import {
  fetchWithTimeoutResult,
  makeJsonResponse,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from './test-fixtures.mts'

const VALID_ACTOR_URI = 'https://remote.example/users/alice'
const VALID_KEY_ID = `${VALID_ACTOR_URI}#main-key`
const VALID_PUBLIC_KEY_PEM = VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM

function validActorDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ACTOR_URI,
    type: 'Person',
    inbox: `${VALID_ACTOR_URI}/inbox`,
    endpoints: { sharedInbox: 'https://remote.example/inbox' },
    publicKey: {
      id: VALID_KEY_ID,
      owner: VALID_ACTOR_URI,
      publicKeyPem: VALID_PUBLIC_KEY_PEM,
    },
    ...overrides,
  }
}

describe('fetchRemoteActorDocument', () => {
  const fetchWithTimeout = vi.fn<VitestLooseMock>()
  const validateUrl = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
    validateUrl.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  it('parses a well-formed actor document', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse(validActorDocument())),
    )

    const result = await fetchRemoteActorDocument(VALID_ACTOR_URI, {
      fetchWithTimeout,
      validateUrl,
    })

    expect(result).toEqual({
      actorUri: VALID_ACTOR_URI,
      inboxUrl: `${VALID_ACTOR_URI}/inbox`,
      sharedInboxUrl: 'https://remote.example/inbox',
      keyId: VALID_KEY_ID,
      publicKeyPem: VALID_PUBLIC_KEY_PEM,
    })
  })

  it('defaults sharedInboxUrl to null when endpoints.sharedInbox is absent', async () => {
    const { endpoints: _endpoints, ...withoutEndpoints } = validActorDocument()
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse(withoutEndpoints)),
    )

    const result = await fetchRemoteActorDocument(VALID_ACTOR_URI, {
      fetchWithTimeout,
      validateUrl,
    })

    expect(result.sharedInboxUrl).toBeNull()
  })

  it('rejects an SSRF-unsafe actor URI without fetching', async () => {
    validateUrl.mockRejectedValueOnce(
      new UnsafeUrlError('https://internal.local/', 'IP address is private'),
    )

    await expect(
      fetchRemoteActorDocument('https://internal.local/users/alice', {
        fetchWithTimeout,
        validateUrl,
      }),
    ).rejects.toThrow(/unsafe/i)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('throws on a non-2xx response', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse({ error: 'not found' }, 404)),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/404/)
  })

  it('throws when the response body is not valid JSON', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('not json'))
        controller.close()
      },
    })
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(new Response(stream, { status: 200 })),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/JSON/)
  })

  it('throws when id is missing', async () => {
    const { id: _id, ...withoutId } = validActorDocument()
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeJsonResponse(withoutId)))

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/id/)
  })

  it('throws when inbox is missing', async () => {
    const { inbox: _inbox, ...withoutInbox } = validActorDocument()
    fetchWithTimeout.mockResolvedValueOnce(fetchWithTimeoutResult(makeJsonResponse(withoutInbox)))

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/inbox/)
  })

  it('throws when publicKey is missing', async () => {
    const { publicKey: _publicKey, ...withoutPublicKey } = validActorDocument()
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse(withoutPublicKey)),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/publicKey/)
  })

  it('throws when publicKey.publicKeyPem is not a valid PEM', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(
        makeJsonResponse(
          validActorDocument({ publicKey: { id: VALID_KEY_ID, publicKeyPem: 'not-a-pem' } }),
        ),
      ),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toThrow(/public key/i)
  })

  it('bounds DNS/SSRF resolution with a timeoutMs option', async () => {
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(makeJsonResponse(validActorDocument())),
    )

    await fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl })

    expect(validateUrl).toHaveBeenCalledWith(VALID_ACTOR_URI, {
      timeoutMs: expect.any(Number),
    })
    const [, options] = validateUrl.mock.calls[0] as [string, { timeoutMs: number }]
    expect(options.timeoutMs).toBeGreaterThan(0)
  })

  it('treats a DNS resolution timeout as availability-failed, not SSRF-unsafe', async () => {
    validateUrl.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toBeInstanceOf(RemoteActorFetchAvailabilityError)
    expect(fetchWithTimeout).not.toHaveBeenCalled()
  })

  it('still treats an ENOTFOUND DNS failure as availability-failed', async () => {
    validateUrl.mockRejectedValueOnce(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toBeInstanceOf(RemoteActorFetchAvailabilityError)
  })

  it('treats a request-phase fetch timeout as availability-failed', async () => {
    fetchWithTimeout.mockRejectedValueOnce(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toBeInstanceOf(RemoteActorFetchAvailabilityError)
  })

  it('treats a body-phase read timeout as availability-failed', async () => {
    const abortController = new AbortController()
    abortController.abort(
      new DOMException('The operation was aborted due to timeout', 'TimeoutError'),
    )
    fetchWithTimeout.mockResolvedValueOnce({
      response: makeJsonResponse(validActorDocument()),
      responseSignal: abortController.signal,
    })

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.toBeInstanceOf(RemoteActorFetchAvailabilityError)
  })

  it('keeps an oversize response body fail-closed, not availability-failed', async () => {
    const oversizeBytes = new Uint8Array(1_000_001)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizeBytes)
        controller.close()
      },
    })
    fetchWithTimeout.mockResolvedValueOnce(
      fetchWithTimeoutResult(new Response(stream, { status: 200 })),
    )

    await expect(
      fetchRemoteActorDocument(VALID_ACTOR_URI, { fetchWithTimeout, validateUrl }),
    ).rejects.not.toBeInstanceOf(RemoteActorFetchAvailabilityError)
  })
})
