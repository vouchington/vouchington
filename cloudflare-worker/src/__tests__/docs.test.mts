import { describe, expect, it } from 'vitest'
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types/index.ts'

import { serveDocs } from '../docs.mts'
import type { Env } from '../types.mts'

const BASIC_AUTH_CREDENTIALS = 'alice:secret,bob:other:secret'

function basic(value: string): string {
  return `Basic ${btoa(value)}`
}

function authenticatedRequest(path = '/'): Request {
  return new Request(`https://docs.voucha.ai${path}`, {
    headers: { authorization: basic('alice:secret') },
  })
}

function createFakeBucket(objects: Record<string, string>): {
  bucket: R2Bucket
  getCallCount: () => number
  getKeys: () => string[]
} {
  let calls = 0
  const keys: string[] = []
  const bucket = {
    get: (key: string) => {
      calls += 1
      keys.push(key)
      const content = objects[key]
      if (content === undefined) return Promise.resolve(null)
      // Ambient ReadableStream (from @types/node, pulled in via tsconfig `types: ["node"]`) and
      // workers-types' R2ObjectBody don't overlap enough for a direct assertion; see
      // http-dispatchers.mts for the same version-skew cast rationale.
      return Promise.resolve({ body: new Response(content).body } as unknown as R2ObjectBody)
    },
  } as unknown as R2Bucket
  return { bucket, getCallCount: () => calls, getKeys: () => keys }
}

function configuredEnv(bucket?: R2Bucket): Env {
  return {
    BASIC_AUTH_CREDENTIALS,
    ...(bucket ? { DOCS_BUCKET: bucket } : {}),
  }
}

describe('serveDocs path and content mapping', () => {
  it.each([
    ['/', 'index.html'],
    ['/guide/', 'guide/index.html'],
    ['/mcp', 'mcp/index.html'],
    ['/mcp/mcp.json', 'mcp/mcp.json'],
  ])('reads %s from its published R2 key', async (path, key) => {
    const { bucket, getKeys } = createFakeBucket({ [key]: 'docs' })
    const response = await serveDocs(authenticatedRequest(path), configuredEnv(bucket))

    expect(response.status).toBe(200)
    expect(getKeys()).toEqual([key])
  })

  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['data.json', 'application/json; charset=utf-8'],
    ['app.js', 'text/javascript; charset=utf-8'],
    ['style.css', 'text/css; charset=utf-8'],
    ['logo.svg', 'image/svg+xml'],
    ['photo.png', 'image/png'],
    ['README.md', 'text/markdown; charset=utf-8'],
    ['notes.txt', 'text/plain; charset=utf-8'],
    ['archive.tar.gz', 'application/octet-stream'],
    ['LICENSE.', 'application/octet-stream'],
  ])('serves %s with the appropriate content type', async (key, contentType) => {
    const { bucket } = createFakeBucket({ [key]: 'docs' })
    const response = await serveDocs(authenticatedRequest(`/${key}`), configuredEnv(bucket))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(contentType)
  })
})

describe('serveDocs', () => {
  it('fails closed when required Basic Auth configuration is absent or malformed', async () => {
    const { bucket, getCallCount } = createFakeBucket({ 'index.html': 'private' })

    for (const credentials of [undefined, '', 'alice:secret,bad']) {
      const response = await serveDocs(authenticatedRequest(), {
        DOCS_BUCKET: bucket,
        ...(credentials === undefined ? {} : { BASIC_AUTH_CREDENTIALS: credentials }),
      })
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toContain('no-store')
    }
    expect(getCallCount()).toBe(0)
  })

  it('challenges missing and incorrect Basic Auth before reading R2', async () => {
    const { bucket, getCallCount } = createFakeBucket({ 'index.html': 'private' })
    const env = configuredEnv(bucket)

    for (const authorization of [undefined, basic('alice:wrong')]) {
      const response = await serveDocs(
        new Request('https://docs.voucha.ai/', {
          ...(authorization ? { headers: { authorization } } : {}),
        }),
        env,
      )
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe(
        'Basic realm="Voucha Internal References", charset="UTF-8"',
      )
    }
    expect(getCallCount()).toBe(0)
  })

  it('serves authenticated docs with private no-store response headers', async () => {
    const { bucket } = createFakeBucket({ 'index.html': '<h1>docs</h1>' })
    const response = await serveDocs(authenticatedRequest(), configuredEnv(bucket))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vary')).toBe('Authorization')
    await expect(response.text()).resolves.toBe('<h1>docs</h1>')
  })

  it('accepts another credential whose password contains colons', async () => {
    const { bucket } = createFakeBucket({ 'index.html': 'docs' })
    const response = await serveDocs(
      new Request('https://docs.voucha.ai/', {
        headers: { authorization: basic('bob:other:secret') },
      }),
      configuredEnv(bucket),
    )

    expect(response.status).toBe(200)
  })

  it('resolves extensionless paths through the R2 sync directory convention', async () => {
    const { bucket } = createFakeBucket({ 'mcp/index.html': '<h1>mcp</h1>' })
    const response = await serveDocs(authenticatedRequest('/mcp'), configuredEnv(bucket))

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('<h1>mcp</h1>')
  })

  it('returns 404 when the R2 object is missing', async () => {
    const { bucket } = createFakeBucket({})
    const response = await serveDocs(authenticatedRequest('/missing'), configuredEnv(bucket))

    expect(response.status).toBe(404)
  })

  it('resolves a plain .. segment normally because URL parsing collapses it', async () => {
    const { bucket } = createFakeBucket({ 'index.html': 'outside' })
    const response = await serveDocs(
      authenticatedRequest('/../../../outside'),
      configuredEnv(bucket),
    )

    expect(response.status).toBe(404)
  })

  it('returns 404 for an encoded traversal segment before reading an R2 key', async () => {
    const { bucket } = createFakeBucket({
      '..%2f..%2foutside': 'literal-key-should-not-serve',
    })
    const response = await serveDocs(
      authenticatedRequest('/..%2f..%2foutside'),
      configuredEnv(bucket),
    )

    expect(response.status).toBe(404)
  })

  it('returns 500 when DOCS_BUCKET is unbound after authentication', async () => {
    const response = await serveDocs(authenticatedRequest(), configuredEnv())

    expect(response.status).toBe(500)
  })
})
