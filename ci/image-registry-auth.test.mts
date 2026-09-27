import { describe, expect, it, vi } from 'vitest'

import {
  resolveGhcrManifest,
  type RegistryFetch,
  type RegistryManifestRequest,
  type RegistryTarget,
} from './image-registry.mts'

const sourceSha = 'a'.repeat(40)
const request: RegistryManifestRequest = {
  credentials: { password: 'credential-secret', username: 'registry-user' },
  reference: `sha-${sourceSha}`,
  target: 'api',
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

describe('GHCR registry authentication boundary', () => {
  it('binds the validated request before awaiting the token response', async () => {
    let resolveToken: ((response: Response) => void) | undefined
    const tokenResponse = new Promise<Response>(resolve => {
      resolveToken = resolve
    })
    const transport = vi
      .fn<RegistryFetch>()
      .mockReturnValueOnce(tokenResponse)
      .mockResolvedValueOnce(jsonResponse({ errors: [{ code: 'MANIFEST_UNKNOWN' }] }, 404))
    const mutableRequest = structuredClone(request)
    const resolution = resolveGhcrManifest(mutableRequest, { fetch: transport })

    mutableRequest.target = 'web'
    mutableRequest.reference = `sha-${'b'.repeat(40)}`
    mutableRequest.credentials.username = 'changed-user'
    mutableRequest.credentials.password = 'changed-password'
    resolveToken?.(jsonResponse({ token: 'bearer-token' }))

    await expect(resolution).resolves.toBeNull()
    expect(transport.mock.calls[0]?.[1]?.headers).toEqual({
      authorization: `Basic ${Buffer.from('registry-user:credential-secret').toString('base64')}`,
    })
    expect(String(transport.mock.calls[1]?.[0])).toBe(
      `https://ghcr.io/v2/vouchington/api/manifests/sha-${sourceSha}`,
    )
  })

  it.each(['api', 'worker-cpu', 'worker-io', 'web'] as const)(
    'derives the token scope and manifest path from the closed %s target',
    async target => {
      const transport = vi
        .fn<RegistryFetch>()
        .mockResolvedValueOnce(jsonResponse({ token: 'bearer-token' }))
        .mockResolvedValueOnce(jsonResponse({ errors: [{ code: 'MANIFEST_UNKNOWN' }] }, 404))

      await expect(
        resolveGhcrManifest({ ...request, target }, { fetch: transport }),
      ).resolves.toBeNull()
      const tokenUrl = new URL(String(transport.mock.calls[0]?.[0]))
      const manifestUrl = new URL(String(transport.mock.calls[1]?.[0]))
      expect(tokenUrl.origin).toBe('https://ghcr.io')
      expect(tokenUrl.searchParams.get('scope')).toBe(`repository:vouchington/${target}:pull`)
      expect(manifestUrl.href).toBe(
        `https://ghcr.io/v2/vouchington/${target}/manifests/sha-${sourceSha}`,
      )
    },
  )

  it.each([
    {},
    { access_token: 'not-the-owned-contract' },
    { access_token: 'other-token', token: 'bearer-token' },
    { token: '' },
    { token: 'contains whitespace' },
  ])('rejects malformed successful token responses without anonymous fallback', async body => {
    const transport = vi.fn<RegistryFetch>().mockResolvedValue(jsonResponse(body))

    await expect(resolveGhcrManifest(request, { fetch: transport })).rejects.toThrow(
      'GHCR manifest resolution failed',
    )
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('bounds the token body and cancels unexpected response bodies', async () => {
    const oversized = vi
      .fn<RegistryFetch>()
      .mockResolvedValue(jsonResponse({ token: 'x'.repeat(512) }))
    await expect(
      resolveGhcrManifest(request, { fetch: oversized, maxBodyBytes: 64 }),
    ).rejects.toThrow('GHCR manifest resolution failed')

    let cancelled = false
    const stream = new ReadableStream({
      cancel() {
        cancelled = true
      },
    })
    const failed = vi.fn<RegistryFetch>().mockResolvedValue(new Response(stream, { status: 500 }))
    await expect(resolveGhcrManifest(request, { fetch: failed })).rejects.toThrow(
      'GHCR manifest resolution failed',
    )
    expect(cancelled).toBe(true)
  })

  it('rejects invalid bounds before authentication', async () => {
    const transport = vi.fn<RegistryFetch>()
    for (const options of [
      { timeoutMs: 0 },
      { timeoutMs: 10_001 },
      { timeoutMs: Number.NaN },
      { maxBodyBytes: 0 },
      { maxBodyBytes: 1024 * 1024 + 1 },
      { maxBodyBytes: 0.5 },
    ]) {
      await expect(resolveGhcrManifest(request, { fetch: transport, ...options })).rejects.toThrow(
        'invalid GHCR registry client bounds',
      )
    }
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects invalid references, targets, and credentials before transport', async () => {
    const transport = vi.fn<RegistryFetch>()
    for (const invalid of [
      { ...request, target: 'attestation' as RegistryTarget },
      { ...request, reference: `sha-${'a'.repeat(39)}` },
      { ...request, reference: `sha256:${'A'.repeat(64)}` },
      { ...request, credentials: { ...request.credentials, password: '' } },
      { ...request, credentials: { ...request.credentials, username: 'bad:name' } },
    ])
      await expect(resolveGhcrManifest(invalid, { fetch: transport })).rejects.toThrow(
        'invalid GHCR manifest request',
      )
    expect(transport).not.toHaveBeenCalled()
  })
})
