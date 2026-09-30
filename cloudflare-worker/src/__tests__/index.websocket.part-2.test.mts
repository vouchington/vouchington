import { describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'

import { createContext } from '../../test-helpers/src/mock-env.mts'
import {
  emitWebSocketEvent,
  installWebSocketHandlingHooks,
  makeMockWebSocket,
  type MockWebSocketLike,
} from '../../test-helpers/src/mock-websocket.mts'

import type { Env } from '../types.mts'

describe('WebSocket handling', () => {
  installWebSocketHandlingHooks()

  it('outer fetch handler bypasses addSecurityHeaders for 101 WebSocket upgrade', async () => {
    const mockWebSocket = makeMockWebSocket()
    globalThis.fetch = vi.fn<VitestLooseMock>().mockResolvedValue({
      status: 101,
      webSocket: mockWebSocket,
    }) as unknown as typeof fetch

    const clientWs = makeMockWebSocket()
    const serverWs = makeMockWebSocket()
    ;(globalThis as any).WebSocketPair = function (this: Record<number, MockWebSocketLike>) {
      this[0] = clientWs
      this[1] = serverWs
    }

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'http://localhost:3000',
      DEV_WEBSOCKET_PROXY: 'true',
    }

    // In the test environment, new Response(null, { status: 101 }) throws a RangeError because
    // the WHATWG Fetch spec disallows status < 200 outside the CF Workers runtime. Production's
    // Workers runtime supports the 101 response; here the top-level unexpected-error boundary
    // must convert that environment-only throw into the standard secured error contract.
    const response = await worker.fetch(
      new Request('https://voucha.ai/_next/hmr', {
        headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
    })

    expect(serverWs.accept).toHaveBeenCalled()
    expect(mockWebSocket.accept).toHaveBeenCalled()
  })

  it('bridges WebSocket message, close, and error events in both directions', async () => {
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

    await worker
      .fetch(
        new Request('https://voucha.ai/_next/hmr', {
          headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
        }),
        env,
        createContext(env),
      )
      .catch(() => {})

    emitWebSocketEvent(serverWs, 'message', { data: 'client-message' })
    emitWebSocketEvent(originWs, 'message', { data: 'origin-message' })
    emitWebSocketEvent(serverWs, 'close', { code: 1000, reason: 'client done' })
    emitWebSocketEvent(originWs, 'close', { code: 1001, reason: 'origin done' })
    emitWebSocketEvent(serverWs, 'error')
    emitWebSocketEvent(originWs, 'error')

    expect(originWs.send).toHaveBeenCalledWith('client-message')
    expect(serverWs.send).toHaveBeenCalledWith('origin-message')
    expect(originWs.close).toHaveBeenCalledWith(1000, 'client done')
    expect(serverWs.close).toHaveBeenCalledWith(1001, 'origin done')
    expect(originWs.close).toHaveBeenCalledWith()
    expect(serverWs.close).toHaveBeenCalledWith()
  })

  it('ignores bridge close and error callbacks when the opposite WebSocket is already closed', async () => {
    const originWs = makeMockWebSocket()
    const clientWs = makeMockWebSocket()
    const serverWs = makeMockWebSocket()
    originWs.close.mockImplementation(() => {
      throw new Error('origin already closed')
    })
    serverWs.close.mockImplementation(() => {
      throw new Error('server already closed')
    })
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

    await worker
      .fetch(
        new Request('https://voucha.ai/_next/hmr', {
          headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
        }),
        env,
        createContext(env),
      )
      .catch(() => {})

    expect(() => emitWebSocketEvent(serverWs, 'close', { code: 1000, reason: '' })).not.toThrow()
    expect(() => emitWebSocketEvent(originWs, 'close', { code: 1000, reason: '' })).not.toThrow()
    expect(() => emitWebSocketEvent(serverWs, 'error')).not.toThrow()
    expect(() => emitWebSocketEvent(originWs, 'error')).not.toThrow()
  })
})
