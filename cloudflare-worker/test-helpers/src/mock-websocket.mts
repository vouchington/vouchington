import { afterEach, beforeEach, vi, type MockInstance } from 'vitest'

import { restoreGlobals, setupMemoryCaches } from './mock-env.mts'

const ORIGINAL_WEBSOCKET_PAIR = (globalThis as any).WebSocketPair

export interface MockWebSocketLike {
  accept: MockInstance
  send: MockInstance
  close: MockInstance
  addEventListener: MockInstance
  listeners: Map<string, Array<(event: unknown) => void>>
}

export const makeMockWebSocket = (): MockWebSocketLike => {
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

export const emitWebSocketEvent = (
  socket: MockWebSocketLike,
  type: string,
  event: unknown = {},
): void => {
  for (const listener of socket.listeners.get(type) ?? []) {
    listener(event)
  }
}

export const installWebSocketHandlingHooks = (): void => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    ;(globalThis as any).WebSocketPair = ORIGINAL_WEBSOCKET_PAIR
    vi.restoreAllMocks()
  })
}
