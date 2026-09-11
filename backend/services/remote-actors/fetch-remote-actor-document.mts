import { validateUrl, UnsafeUrlError } from 'ssrf-guard/node'
import { fetchWithTimeout, readResponseBody } from '@modules/utils/http'
import { assertPublicKeyPem } from '@modules/http-signatures'
import createHttpError from 'http-errors'
import {
  isDnsResolutionAvailabilityError,
  isFetchTransportError,
  isResponseBodyTransportError,
  RemoteActorFetchAvailabilityError,
} from './fetch-availability-errors.mts'
export { RemoteActorFetchAvailabilityError } from './fetch-availability-errors.mts'

const FETCH_TIMEOUT_MS = 10000
// ssrf-guard@1.0.0's validateUrl short-circuits to no timeout when both `signal` and `timeoutMs`
// are undefined (mirrors crawl-url/safety.mts:9-12's DEFAULT_DNS_TIMEOUT_MS), so this option is
// mandatory, not a tuning knob.
const DNS_TIMEOUT_MS = 5000
// Actor documents are small JSON-LD objects; 1MB is generous headroom over any real-world one.
const MAX_BODY_BYTES = 1_000_000
const ACTIVITY_JSON_ACCEPT = 'application/activity+json, application/ld+json'

export interface RemoteActorDocument {
  actorUri: string
  inboxUrl: string
  sharedInboxUrl: string | null
  keyId: string
  publicKeyPem: string
}

// Thrown only for a successfully-fetched (2xx) body that parses but is not a usable actor document
// (bad JSON, missing fields, invalid PEM). Response-body, SSRF-validation, and unexpected failures
// also remain distinct from RemoteActorFetchAvailabilityError so get-or-fetch.mts fails closed.
export class RemoteActorDocumentInvalidError extends Error {
  readonly status = 422
  readonly statusCode = 422
  readonly expose = true

  constructor(message: string) {
    super(message)
    this.name = 'RemoteActorDocumentInvalidError'
  }
}

export type FetchRemoteActorDocumentDeps = {
  fetchWithTimeout: typeof fetchWithTimeout
  validateUrl: typeof validateUrl
}

const defaultDeps: FetchRemoteActorDocumentDeps = {
  fetchWithTimeout,
  validateUrl,
}

// Fetches and parses a remote ActivityPub actor document by its URI. SSRF-guarded: the hostname
// is resolved and validated against private/loopback ranges before any request, and the
// connection is pinned to the validated addresses (no TOCTOU window between check and fetch).
/* no-mistakes: integration=activitypub */
export async function fetchRemoteActorDocument(
  actorUri: string,
  deps: FetchRemoteActorDocumentDeps = defaultDeps,
): Promise<RemoteActorDocument> {
  let resolvedAddresses
  try {
    resolvedAddresses = await deps.validateUrl(actorUri, { timeoutMs: DNS_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw createHttpError(422, `Unsafe remote actor URI: ${error.reason}`)
    }
    if (isDnsResolutionAvailabilityError(error)) {
      throw new RemoteActorFetchAvailabilityError(
        'Remote actor hostname resolution unavailable',
        error,
      )
    }
    throw error
  }

  let response: Response
  let responseSignal: AbortSignal
  try {
    ;({ response, responseSignal } = await deps.fetchWithTimeout({
      url: actorUri,
      headers: { Accept: ACTIVITY_JSON_ACCEPT },
      requestTimeoutMs: FETCH_TIMEOUT_MS,
      responseTimeoutMs: FETCH_TIMEOUT_MS,
      resolvedAddresses,
    }))
  } catch (error) {
    if (!isFetchTransportError(error)) throw error
    throw new RemoteActorFetchAvailabilityError('Remote actor document fetch failed', error)
  }
  if (!response.ok) {
    response.body?.cancel()
    const cause = createHttpError(
      502,
      `Remote actor document fetch failed with status ${response.status}`,
    )
    throw new RemoteActorFetchAvailabilityError(cause.message, cause)
  }

  let body: string
  try {
    body = await readResponseBody({
      response,
      url: actorUri,
      maxSizeBytes: MAX_BODY_BYTES,
      signal: responseSignal,
    })
  } catch (error) {
    if (!isResponseBodyTransportError(error)) throw error
    throw new RemoteActorFetchAvailabilityError('Remote actor response body was interrupted', error)
  }
  return parseRemoteActorDocument(body)
}

function parseRemoteActorDocument(body: string): RemoteActorDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new RemoteActorDocumentInvalidError('Remote actor document is not valid JSON')
  }
  assertRecord(parsed, 'Remote actor document')

  const id = parsed.id
  const inbox = parsed.inbox
  const endpoints = parsed.endpoints
  const publicKey = parsed.publicKey

  if (typeof id !== 'string' || !id) {
    throw new RemoteActorDocumentInvalidError('Remote actor document is missing an id')
  }
  if (typeof inbox !== 'string' || !inbox) {
    throw new RemoteActorDocumentInvalidError('Remote actor document is missing an inbox')
  }
  assertRecord(publicKey, 'Remote actor document publicKey')
  const keyId = publicKey.id
  const publicKeyPem = publicKey.publicKeyPem
  if (typeof keyId !== 'string' || !keyId) {
    throw new RemoteActorDocumentInvalidError('Remote actor document publicKey is missing an id')
  }
  if (typeof publicKeyPem !== 'string' || !publicKeyPem) {
    throw new RemoteActorDocumentInvalidError(
      'Remote actor document publicKey is missing publicKeyPem',
    )
  }
  try {
    assertPublicKeyPem(publicKeyPem)
  } catch (err) {
    throw new RemoteActorDocumentInvalidError(
      err instanceof Error ? err.message : 'Invalid public key PEM format',
    )
  }

  let sharedInboxUrl: string | null = null
  if (endpoints !== undefined) {
    assertRecord(endpoints, 'Remote actor document endpoints')
    const sharedInbox = endpoints.sharedInbox
    if (typeof sharedInbox === 'string' && sharedInbox) sharedInboxUrl = sharedInbox
  }

  return { actorUri: id, inboxUrl: inbox, sharedInboxUrl, keyId, publicKeyPem }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RemoteActorDocumentInvalidError(`${label} must be a JSON object`)
  }
}
