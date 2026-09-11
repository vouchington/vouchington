import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import worker from '../index.mts'

import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'

import type { Env } from '../types.mts'

const ORIGINAL_WEBSOCKET_PAIR = (globalThis as any).WebSocketPair

interface MockWebSocketLike {
  accept: MockInstance
  send: MockInstance
  close: MockInstance
  addEventListener: MockInstance
  listeners: Map<string, Array<(event: unknown) => void>>
}

const makeMockWebSocket = (): MockWebSocketLike => {
  const listeners = new Map<string, Array<(event: unknown) => void>>()
  return {
    accept: vi.fn<VitestLooseMock>(),
    send: vi.fn<VitestLooseMock>(),
    close: vi.fn<VitestLooseMock>(),
    addEventListener: vi.fn<(type: string, listener: (event: unknown) => void) => void>(
      (type, listener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
      },
    ),
    listeners,
  }
}

const emitWebSocketEvent = (socket: MockWebSocketLike, type: string, event: unknown = {}): void => {
  for (const listener of socket.listeners.get(type) ?? []) {
    listener(event)
  }
}

describe('WebSocket handling', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    ;(globalThis as any).WebSocketPair = ORIGINAL_WEBSOCKET_PAIR
    vi.restoreAllMocks()
  })

  it('proxies WebSocket upgrade to HMR endpoint: calls accept() on both WebSockets', async () => {
    const originWs = makeMockWebSocket()
    const clientWs = makeMockWebSocket()
    const serverWs = makeMockWebSocket()
    ;(globalThis as any).WebSocketPair = function (this: Record<number, MockWebSocketLike>) {
      this[0] = clientWs
      this[1] = serverWs
    }
    globalThis.fetch = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 101,
      webSocket: originWs,
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    // In the test environment new Response(null, { status: 101 }) throws a RangeError
    // because the WHATWG Fetch spec disallows status < 200 outside the CF Workers runtime.
    // We still verify that accept() was called on both sides of the bridge.
    await worker
      .fetch(
        new Request('https://voucha.ai/_next/webpack-hmr', {
          headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
        }),
        env,
        createContext(env),
      )
      .catch(() => {})

    expect(serverWs.accept).toHaveBeenCalled()
    expect(originWs.accept).toHaveBeenCalled()
  })

  it('returns 502 when WebSocket origin does not return a webSocket', async () => {
    const clientWs = makeMockWebSocket()
    const serverWs = makeMockWebSocket()
    ;(globalThis as any).WebSocketPair = function (this: Record<number, MockWebSocketLike>) {
      this[0] = clientWs
      this[1] = serverWs
    }
    globalThis.fetch = vi
      .fn<() => unknown>()
      .mockResolvedValue(
        new Response('not a websocket', { status: 200 }),
      ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/webpack-hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(502)
  })

  it('returns 502 when WebSocket origin fetch fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.reject(new Error('origin unavailable')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/webpack-hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledWith(
      'WebSocket origin fetch failed:',
      expect.objectContaining({ message: 'origin unavailable' }),
    )
  })

  it('returns 400 for WebSocket when WEB_ORIGIN is not configured', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>() as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      DEV_WEBSOCKET_PROXY: 'true',
      // WEB_ORIGIN intentionally omitted
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/webpack-hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 for WebSocket when DEV_WEBSOCKET_PROXY is not set (staging/production)', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>() as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      // DEV_WEBSOCKET_PROXY intentionally omitted
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/webpack-hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 for WebSocket when DEV_WEBSOCKET_PROXY is set to a non-"true" value', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>() as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'false',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/webpack-hmr', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 for WebSocket upgrade on non-HMR path even with DEV_WEBSOCKET_PROXY', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>() as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/some-other-path', {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof emitWebSocketEvent)
})
