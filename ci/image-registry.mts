import { createHash } from 'node:crypto'

import {
  fetchRegistryResponse,
  readRegistryBody,
  resolveRegistryBounds,
  type RegistryClientOptions,
  type RegistryFetch,
} from './image-registry-http.mts'
import {
  classifyRegistryManifest,
  REGISTRY_ACCEPT,
  REGISTRY_DIGEST,
} from './image-registry-manifest.mts'

export type { RegistryClientOptions, RegistryFetch }

const REPOSITORY = 'vouchington'
const REGISTRY = 'ghcr.io'
const TARGETS = new Set(['api', 'worker-cpu', 'worker-io', 'web'])
const TAG = /^sha-[0-9a-f]{40}$/u
const TOKEN = /^[\x21-\x7e]+$/u
const MEDIA_TYPE = /^application\/[a-z0-9][a-z0-9.+-]*$/u

export type RegistryTarget = 'api' | 'worker-cpu' | 'worker-io' | 'web'
export type RegistryManifestRequest = {
  credentials: { password: string; username: string }
  reference: string
  target: RegistryTarget
}
export type ResolvedRegistryManifest = {
  classification: 'protected' | 'runtime'
  digest: string
  mediaType: string
}

type Json = Record<string, unknown>
const record = (value: unknown): Json | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined

function validateRequest(request: RegistryManifestRequest): void {
  const { password, username } = request.credentials ?? {}
  const validCredential = (value: unknown, max: number) =>
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    ![...value].some(character => character < ' ' || character === '\u007f')
  if (
    !TARGETS.has(request.target) ||
    (!TAG.test(request.reference) && !REGISTRY_DIGEST.test(request.reference)) ||
    !validCredential(username, 256) ||
    username.includes(':') ||
    !validCredential(password, 16_384)
  )
    throw new Error('invalid GHCR manifest request')
}

function parseJson(body: Buffer): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown
}

function isMissingManifest(value: unknown): boolean {
  const envelope = record(value)
  if (!envelope || Object.keys(envelope).length !== 1) return false
  const errors = envelope['errors']
  if (!Array.isArray(errors) || errors.length !== 1) return false
  const error = record(errors[0])
  return Boolean(
    error?.['code'] === 'MANIFEST_UNKNOWN' &&
    (!Object.hasOwn(error, 'message') || typeof error['message'] === 'string'),
  )
}

export async function resolveGhcrManifest(
  request: RegistryManifestRequest,
  options: RegistryClientOptions = {},
): Promise<ResolvedRegistryManifest | null> {
  validateRequest(request)
  const { password, username } = request.credentials
  const { reference, target } = request
  const callerSignal = options.signal
  const bounds = resolveRegistryBounds(options)
  const transport = options.fetch ?? fetch
  try {
    const tokenUrl = new URL(`https://${REGISTRY}/token`)
    tokenUrl.searchParams.set('service', REGISTRY)
    tokenUrl.searchParams.set('scope', `repository:${REPOSITORY}/${target}:pull`)
    const basic = Buffer.from(`${username}:${password}`).toString('base64')
    const tokenResponse = await fetchRegistryResponse(
      transport,
      tokenUrl,
      { authorization: `Basic ${basic}` },
      bounds,
      callerSignal,
    )
    if (tokenResponse.status !== 200) {
      await tokenResponse.body?.cancel()
      throw new Error('token request failed')
    }
    const tokenEnvelope = record(
      parseJson(await readRegistryBody(tokenResponse, bounds.maxBodyBytes)),
    )
    if (tokenEnvelope && Object.hasOwn(tokenEnvelope, 'access_token'))
      throw new Error('token response is ambiguous')
    const token = tokenEnvelope?.['token']
    if (typeof token !== 'string' || token.length > 65_536 || !TOKEN.test(token))
      throw new Error('token response is invalid')

    const manifestUrl = new URL(
      `https://${REGISTRY}/v2/${REPOSITORY}/${target}/manifests/${reference}`,
    )
    const response = await fetchRegistryResponse(
      transport,
      manifestUrl,
      { accept: REGISTRY_ACCEPT, authorization: `Bearer ${token}` },
      bounds,
      callerSignal,
    )
    if (response.status === 404) {
      if (isMissingManifest(parseJson(await readRegistryBody(response, bounds.maxBodyBytes))))
        return null
      throw new Error('manifest absence is ambiguous')
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error('manifest request failed')
    }
    const body = await readRegistryBody(response, bounds.maxBodyBytes)
    const digest = response.headers.get('docker-content-digest')
    const actualDigest = `sha256:${createHash('sha256').update(body).digest('hex')}`
    if (!digest || !REGISTRY_DIGEST.test(digest) || digest !== actualDigest)
      throw new Error('manifest digest is invalid')
    if (REGISTRY_DIGEST.test(reference) && reference !== digest)
      throw new Error('manifest digest reference changed')
    const manifest = record(parseJson(body))
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (
      !manifest ||
      manifest['schemaVersion'] !== 2 ||
      typeof manifest['mediaType'] !== 'string' ||
      !MEDIA_TYPE.test(manifest['mediaType']) ||
      contentType !== manifest['mediaType']
    )
      throw new Error('manifest envelope is invalid')
    return {
      classification: classifyRegistryManifest(manifest, manifest['mediaType']),
      digest,
      mediaType: manifest['mediaType'],
    }
  } catch {
    throw new Error('GHCR manifest resolution failed')
  }
}
