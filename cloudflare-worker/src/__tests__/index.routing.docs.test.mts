import { describe, expect, it, vi } from 'vitest'
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types/index.ts'
import { createWorker } from '../index.mts'
import { createContext } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

function createFakeBucket(objects: Record<string, string>): R2Bucket {
  return {
    get: (key: string) => {
      const content = objects[key]
      if (content === undefined) return Promise.resolve(null)
      // Ambient ReadableStream (from @types/node, pulled in via tsconfig `types: ["node"]`) and
      // workers-types' R2ObjectBody don't overlap enough for a direct assertion; see
      // http-dispatchers.mts for the same version-skew cast rationale.
      return Promise.resolve({ body: new Response(content).body } as unknown as R2ObjectBody)
    },
  } as unknown as R2Bucket
}

function basic(value: string): string {
  return `Basic ${btoa(value)}`
}

// env.DOCS_BUCKET routes to serveDocs() before backend origin resolution, bot-tier
// classification, or application CSP construction. The outer handler still owns the
// request ID and baseline response security headers for every response surface.
describe('worker fetch handler — docs bucket routing', () => {
  it('serves the docs bucket instead of forwarding to BACKEND_ORIGIN when DOCS_BUCKET is bound', async () => {
    const fetchInner = vi.fn<VitestLooseMock>()
    const worker = createWorker({ fetchInner })
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      DOCS_BUCKET: createFakeBucket({ 'index.html': '<h1>docs</h1>' }),
      BASIC_AUTH_CREDENTIALS: 'alice:secret',
    }

    const response = await worker.fetch(
      new Request('https://docs.voucha.ai/', {
        headers: { authorization: basic('alice:secret') },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('<h1>docs</h1>')
    expect(fetchInner).not.toHaveBeenCalled()
  })

  it('attaches the request ID and baseline security headers to the docs response', async () => {
    const worker = createWorker({
      fetchInner: vi.fn<VitestLooseMock>(),
    })
    const env: Env = {
      DOCS_BUCKET: createFakeBucket({ 'index.html': 'ok' }),
      BASIC_AUTH_CREDENTIALS: 'alice:secret',
    }

    const response = await worker.fetch(
      new Request('https://docs.voucha.ai/', {
        headers: { authorization: basic('alice:secret') },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('still enforces Basic Auth ahead of the rest of the pipeline', async () => {
    const fetchInner = vi.fn<VitestLooseMock>()
    const worker = createWorker({ fetchInner })
    const env: Env = {
      DOCS_BUCKET: createFakeBucket({ 'index.html': 'ok' }),
      BASIC_AUTH_CREDENTIALS: 'alice:secret',
    }

    const response = await worker.fetch(
      new Request('https://docs.voucha.ai/'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(fetchInner).not.toHaveBeenCalled()
  })
})
