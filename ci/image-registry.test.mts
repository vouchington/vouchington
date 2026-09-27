import { createHash } from 'node:crypto'
import { createServer, type RequestListener, type ServerResponse } from 'node:http'

import { describe, expect, it } from 'vitest'

import { listenOnEphemeralPort } from '../ts-shared/utils/ephemeral-ports.mts'
import {
  resolveGhcrManifest,
  type RegistryFetch,
  type RegistryManifestRequest,
} from './image-registry.mts'

const sha = 'a'.repeat(40)
const credentials = { password: 'credential-secret', username: 'registry-user' }
const request: RegistryManifestRequest = {
  credentials,
  reference: `sha-${sha}`,
  target: 'api',
}
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json'
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json'

type Reply = {
  body: unknown | string
  contentType?: string
  digest?: string
  status?: number
}

function runtimeManifest(mediaType = OCI_MANIFEST): Record<string, unknown> {
  const oci = mediaType === OCI_MANIFEST
  return {
    config: {
      digest: `sha256:${'c'.repeat(64)}`,
      mediaType: oci
        ? 'application/vnd.oci.image.config.v1+json'
        : 'application/vnd.docker.container.image.v1+json',
      size: 512,
    },
    layers: [
      {
        digest: `sha256:${'d'.repeat(64)}`,
        mediaType: oci
          ? 'application/vnd.oci.image.layer.v1.tar+gzip'
          : 'application/vnd.docker.image.rootfs.diff.tar.gzip',
        size: 1024,
      },
    ],
    mediaType,
    schemaVersion: 2,
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

function sendReply(response: ServerResponse, reply: Reply): void {
  const raw = Buffer.from(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body))
  const mediaType =
    reply.contentType ??
    (typeof reply.body === 'object' && reply.body !== null && 'mediaType' in reply.body
      ? String(reply.body.mediaType)
      : 'application/json')
  response.writeHead(reply.status ?? 200, {
    'content-type': mediaType,
    'docker-content-digest':
      reply.digest ?? `sha256:${createHash('sha256').update(raw).digest('hex')}`,
  })
  response.end(raw)
}

async function withServer<T>(handler: RequestListener, run: (fetch: RegistryFetch) => Promise<T>) {
  const server = createServer(handler)
  const port = await listenOnEphemeralPort(server, '127.0.0.1')
  const relay: RegistryFetch = (input, init) => {
    const upstream = new URL(input instanceof Request ? input.url : input.toString())
    return fetch(`http://127.0.0.1:${port}${upstream.pathname}${upstream.search}`, init)
  }
  try {
    return await run(relay)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  }
}

async function resolveReply(
  reply: Reply,
  manifestRequest: RegistryManifestRequest = request,
  options: { maxBodyBytes?: number; signal?: AbortSignal; timeoutMs?: number } = {},
) {
  return withServer(
    (incoming, response) => {
      const url = new URL(incoming.url ?? '/', 'http://registry.test')
      if (url.pathname === '/token') return sendJson(response, 200, { token: 'bearer-token' })
      sendReply(response, reply)
    },
    transport => resolveGhcrManifest(manifestRequest, { fetch: transport, ...options }),
  )
}

describe('GHCR manifest registry client', () => {
  it.each([OCI_MANIFEST, DOCKER_MANIFEST])(
    'authenticates and classifies a direct %s runtime manifest',
    async mediaType => {
      const observed: Array<{ accept?: string; authorization?: string; url: URL }> = []
      const result = await withServer(
        (incoming, response) => {
          const url = new URL(incoming.url ?? '/', 'http://registry.test')
          observed.push({
            accept: incoming.headers.accept,
            authorization: incoming.headers.authorization,
            url,
          })
          if (url.pathname === '/token') return sendJson(response, 200, { token: 'bearer-token' })
          sendReply(response, { body: runtimeManifest(mediaType) })
        },
        transport => resolveGhcrManifest(request, { fetch: transport }),
      )

      expect(result).toEqual({
        classification: 'runtime',
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        mediaType,
      })
      expect(observed).toHaveLength(2)
      expect(observed[0]?.url.pathname).toBe('/token')
      expect(observed[0]?.url.searchParams.get('service')).toBe('ghcr.io')
      expect(observed[0]?.url.searchParams.get('scope')).toBe('repository:vouchington/api:pull')
      expect(observed[0]?.authorization).toBe(
        `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
      )
      expect(observed[1]).toMatchObject({
        authorization: 'Bearer bearer-token',
        url: expect.objectContaining({ pathname: `/v2/vouchington/api/manifests/sha-${sha}` }),
      })
      expect(observed[1]?.accept).toContain(OCI_MANIFEST)
      expect(observed[1]?.accept).toContain(DOCKER_MANIFEST)
      expect(observed[1]?.authorization).not.toContain(credentials.password)
    },
  )

  it('returns missing only for an authenticated sole MANIFEST_UNKNOWN response', async () => {
    await expect(
      resolveReply({
        body: { errors: [{ code: 'MANIFEST_UNKNOWN', detail: {}, message: 'unknown' }] },
        status: 404,
      }),
    ).resolves.toBeNull()
  })

  it.each([
    { errors: [{ code: 'NAME_UNKNOWN' }] },
    { errors: [{ code: 'MANIFEST_UNKNOWN' }, { code: 'NAME_UNKNOWN' }] },
    { errors: [{ code: 'MANIFEST_UNKNOWN', message: 42 }] },
    { errors: [{ code: 'MANIFEST_UNKNOWN' }], unexpected: true },
    { errors: [] },
    'not-json',
  ])('rejects ambiguous or malformed 404 bodies', async body => {
    await expect(resolveReply({ body, status: 404 })).rejects.toThrow(
      'GHCR manifest resolution failed',
    )
  })

  it.each([
    { body: { errors: [{ code: 'UNAUTHORIZED' }] }, status: 401 },
    { body: { errors: [{ code: 'TOOMANYREQUESTS' }] }, status: 429 },
    { body: { errors: [{ code: 'UNKNOWN' }] }, status: 500 },
  ])('rejects manifest HTTP failures without retrying', async reply => {
    let manifests = 0
    await expect(
      withServer(
        (incoming, response) => {
          if (incoming.url?.startsWith('/token')) return sendJson(response, 200, { token: 'token' })
          manifests += 1
          sendReply(response, reply)
        },
        transport => resolveGhcrManifest(request, { fetch: transport }),
      ),
    ).rejects.toThrow('GHCR manifest resolution failed')
    expect(manifests).toBe(1)
  })

  it.each([401, 404, 429, 500])(
    'treats token status %i as an authentication failure',
    async status => {
      await expect(
        withServer(
          (_incoming, response) => sendJson(response, status, { token: 'credential-secret' }),
          transport => resolveGhcrManifest(request, { fetch: transport }),
        ),
      ).rejects.toThrow('GHCR manifest resolution failed')
    },
  )

  it.each(['token', 'manifest'])('denies %s redirects without forwarding credentials', async at => {
    let leakRequests = 0
    await expect(
      withServer(
        (incoming, response) => {
          const path = new URL(incoming.url ?? '/', 'http://registry.test').pathname
          if (path === '/leak') {
            leakRequests += 1
            return sendJson(response, 200, { token: 'leaked' })
          }
          if ((at === 'token' && path === '/token') || (at === 'manifest' && path !== '/token')) {
            response.writeHead(302, { location: '/leak' })
            return response.end()
          }
          sendJson(response, 200, { token: 'bearer-token' })
        },
        transport => resolveGhcrManifest(request, { fetch: transport }),
      ),
    ).rejects.toThrow('GHCR manifest resolution failed')
    expect(leakRequests).toBe(0)
  })

  it.each([
    { body: runtimeManifest(), digest: `sha256:${'0'.repeat(64)}` },
    { body: runtimeManifest(), digest: `sha256:${'A'.repeat(64)}` },
    { body: { ...runtimeManifest(), mediaType: DOCKER_MANIFEST }, contentType: OCI_MANIFEST },
    { body: { ...runtimeManifest(), schemaVersion: 1 } },
    { body: 'invalid-json', contentType: OCI_MANIFEST },
  ])('rejects digest, media-type, schema, and JSON tampering', async reply => {
    await expect(resolveReply(reply)).rejects.toThrow('GHCR manifest resolution failed')
  })

  it('requires digest references to resolve to that exact immutable digest', async () => {
    const body = runtimeManifest()
    const raw = Buffer.from(JSON.stringify(body))
    const actual = `sha256:${createHash('sha256').update(raw).digest('hex')}`
    await expect(
      resolveReply({ body }, { ...request, reference: `sha256:${'f'.repeat(64)}` }),
    ).rejects.toThrow('GHCR manifest resolution failed')
    await expect(resolveReply({ body }, { ...request, reference: actual })).resolves.toMatchObject({
      digest: actual,
    })
  })

  it.each([
    { ...runtimeManifest(), artifactType: 'application/vnd.example.attestation' },
    { ...runtimeManifest(), subject: { digest: `sha256:${'e'.repeat(64)}` } },
    { manifests: [], mediaType: OCI_INDEX, schemaVersion: 2 },
    { mediaType: 'application/vnd.example.unknown+json', schemaVersion: 2 },
    { ...runtimeManifest(), config: {} },
    { ...runtimeManifest(), layers: [] },
  ])('protects image-shaped artifacts, indexes, and unknown manifests', async body => {
    await expect(resolveReply({ body })).resolves.toMatchObject({ classification: 'protected' })
  })

  it('bounds response bodies and sanitizes transport failures', async () => {
    await expect(
      resolveReply({ body: runtimeManifest() }, request, { maxBodyBytes: 16 }),
    ).rejects.toThrow('GHCR manifest resolution failed')
    const failure = await resolveGhcrManifest(request, {
      fetch: async () => {
        throw new Error('credential-secret')
      },
    }).catch((error: unknown) => error)
    expect(failure).toEqual(new Error('GHCR manifest resolution failed'))
    expect(failure).not.toHaveProperty('cause')
  })

  it('enforces request deadlines and caller cancellation', async () => {
    await expect(
      withServer(
        () => undefined,
        transport => resolveGhcrManifest(request, { fetch: transport, timeoutMs: 25 }),
      ),
    ).rejects.toThrow('GHCR manifest resolution failed')
    await expect(
      withServer(
        (_incoming, response) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.write('{"token":"unfinished')
        },
        transport => resolveGhcrManifest(request, { fetch: transport, timeoutMs: 25 }),
      ),
    ).rejects.toThrow('GHCR manifest resolution failed')
    const controller = new AbortController()
    controller.abort()
    await expect(resolveGhcrManifest(request, { signal: controller.signal })).rejects.toThrow(
      'GHCR manifest resolution failed',
    )
  })
})
