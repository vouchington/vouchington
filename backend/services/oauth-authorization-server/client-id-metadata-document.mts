import { write, type QueryExecutor } from '@data-stores/psql'
import { readResponseBodyAsBuffer } from '@modules/utils/http'
import { safeFetch } from 'ssrf-guard/node'
import { unavailableClientIdMetadata } from './client-id-metadata-errors.mts'
import { parseClientIdMetadataUrl } from './client-id-metadata-url.mts'
import { findNativeOAuthClientDocument } from './native-clients.mts'
import {
  validateAuthMethod,
  validateClientName,
  validateGrantTypes,
  validateRegistrationObject,
  validateResponseTypes,
} from './client-metadata-validation.mts'
import { validateClientIdMetadataRedirectUris } from './redirect-uri-validation.mts'
import { parseOAuthScopes } from './validation.mts'
import type { ClientIdMetadataDocument, OAuthClient } from './types.mts'
import {
  beginClientIdMetadataRefresh,
  getClientIdMetadataExpiry,
  getFreshClientIdMetadataClient,
  upsertClientIdMetadataClient,
  type ValidatedClientIdMetadata,
} from './client-id-metadata-cache.mts'

export const CLIENT_ID_METADATA_MAX_SIZE_BYTES = 5 * 1024
export const CLIENT_ID_METADATA_REQUEST_TIMEOUT_MS = 5_000
export const CLIENT_ID_METADATA_BODY_TIMEOUT_MS = 5_000

type ClientIdMetadataResponse = Pick<
  Awaited<ReturnType<typeof safeFetch>>,
  'body' | 'headers' | 'ok' | 'status' | 'url'
>

export type ClientIdMetadataDependencies = {
  query: QueryExecutor
  readResponseBodyAsBuffer: typeof readResponseBodyAsBuffer
  safeFetch: (
    url: Parameters<typeof safeFetch>[0],
    options: Parameters<typeof safeFetch>[1],
  ) => Promise<ClientIdMetadataResponse>
}

const defaultDependencies: ClientIdMetadataDependencies = {
  query: write,
  readResponseBodyAsBuffer,
  safeFetch,
}

export async function resolveClientIdMetadataDocument(
  clientId: string,
  dependencies: Partial<ClientIdMetadataDependencies> = {},
): Promise<OAuthClient | null> {
  const nativeDocument = findNativeOAuthClientDocument(clientId)
  const metadataUrl = nativeDocument ? clientId : parseClientIdMetadataUrl(clientId)
  if (!metadataUrl) return null
  const deps = { ...defaultDependencies, ...dependencies }
  const cached = await getFreshClientIdMetadataClient(metadataUrl, deps.query)
  if (cached) return cached
  const refresh = await beginClientIdMetadataRefresh(deps.query)
  const fetched = nativeDocument
    ? {
        metadata: validateClientIdMetadata(metadataUrl, nativeDocument),
        response: { headers: new Headers() },
      }
    : await fetchAndValidateClientIdMetadataDocument(metadataUrl, deps)
  const metadataExpiresAt = getClientIdMetadataExpiry(fetched.response.headers, refresh.startedAt)
  const client = await upsertClientIdMetadataClient(
    metadataUrl,
    fetched.metadata,
    { ...refresh, expiresAt: metadataExpiresAt },
    deps.query,
  )
  if (client) return client
  const winningClient = await getFreshClientIdMetadataClient(metadataUrl, deps.query)
  if (winningClient) return winningClient
  throw unavailableClientIdMetadata()
}

async function fetchAndValidateClientIdMetadataDocument(
  metadataUrl: string,
  deps: ClientIdMetadataDependencies,
): Promise<{ metadata: ValidatedClientIdMetadata; response: ClientIdMetadataResponse }> {
  let response: ClientIdMetadataResponse
  const requestController = new AbortController()
  const requestTimeout = setTimeout(
    () => requestController.abort(),
    CLIENT_ID_METADATA_REQUEST_TIMEOUT_MS,
  )
  requestTimeout.unref()
  try {
    response = await deps.safeFetch(metadataUrl, {
      allowedProtocols: ['https:'],
      headers: { Accept: 'application/json, application/*+json;q=0.9' },
      maxRedirects: 0,
      signal: requestController.signal,
    })
  } catch (err) {
    throw unavailableClientIdMetadata(err)
  } finally {
    clearTimeout(requestTimeout)
  }
  if (!response.ok || response.status !== 200 || !isJsonContentType(response.headers)) {
    await cancelResponseBody(response)
    throw unavailableClientIdMetadata()
  }
  let body: Buffer
  try {
    body = await deps.readResponseBodyAsBuffer({
      response,
      url: metadataUrl,
      maxSizeBytes: CLIENT_ID_METADATA_MAX_SIZE_BYTES,
      signal: AbortSignal.timeout(CLIENT_ID_METADATA_BODY_TIMEOUT_MS),
    })
  } catch (err) {
    await cancelResponseBody(response)
    throw unavailableClientIdMetadata(err)
  }
  let input: unknown
  try {
    input = JSON.parse(body.toString('utf8'))
  } catch {
    await cancelResponseBody(response)
    throw unavailableClientIdMetadata()
  }
  try {
    return { metadata: validateClientIdMetadata(metadataUrl, input), response }
  } catch {
    throw unavailableClientIdMetadata()
  }
}

function validateClientIdMetadata(metadataUrl: string, input: unknown): ValidatedClientIdMetadata {
  const metadata = validateRegistrationObject(input) as ClientIdMetadataDocument
  if (metadata.client_id !== metadataUrl) throw unavailableClientIdMetadata()
  if (
    Object.hasOwn(metadata, 'client_secret') ||
    Object.hasOwn(metadata, 'client_secret_expires_at') ||
    hasPrivateKeyMaterial(metadata.jwks)
  ) {
    throw unavailableClientIdMetadata()
  }
  const tokenEndpointAuthMethod = validateAuthMethod(metadata.token_endpoint_auth_method)
  if (tokenEndpointAuthMethod !== 'none') throw unavailableClientIdMetadata()
  return {
    client_name: validateClientName(metadata.client_name),
    redirect_uris: validateClientIdMetadataRedirectUris(metadata.redirect_uris),
    token_endpoint_auth_method: tokenEndpointAuthMethod,
    grant_types: validateGrantTypes(metadata.grant_types),
    response_types: validateResponseTypes(metadata.response_types),
    scopes: parseOAuthScopes(metadata.scope),
  }
}

function hasPrivateKeyMaterial(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Reflect.get(value, 'keys')
  if (!Array.isArray(keys)) return false
  const privateMembers = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']
  return keys.some(
    key =>
      key !== null &&
      typeof key === 'object' &&
      privateMembers.some(member => Object.hasOwn(key, member)),
  )
}

function isJsonContentType(headers: { get(name: string): string | null }): boolean {
  const mediaType = headers.get('content-type')?.split(';', 1)[0]?.trim()
  return mediaType !== undefined && /^application\/(?:json|[^\s/]+\+json)$/iu.test(mediaType)
}

async function cancelResponseBody(response: ClientIdMetadataResponse): Promise<void> {
  await response.body?.cancel().catch(ignoreCancellationError)
}

function ignoreCancellationError(): undefined {
  return undefined
}
