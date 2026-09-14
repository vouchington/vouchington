import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const mockFetchInner = vi.fn<VitestLooseMock>()

describe('worker fetch handler — WebSocket upgrade bypass', () => {
  it('returns a successful WebSocket upgrade response without rebuilding headers', async () => {
    const upgradeResponse = new Response(null, { status: 200 })
    Object.defineProperties(upgradeResponse, {
      status: { value: 101 },
      webSocket: { value: {} },
    })
    mockFetchInner.mockResolvedValue(upgradeResponse)
    const { createWorker } = await import('../index.mts')
    const worker = createWorker({ fetchInner: mockFetchInner })
    const env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    } satisfies Env

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response).toBe(upgradeResponse)
    expect(response.headers.get('x-request-id')).toBeNull()
  })
})
