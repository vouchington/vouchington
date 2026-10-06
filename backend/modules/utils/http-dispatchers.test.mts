import { createServer, type Server } from 'node:http'
import { fetch as undiciFetch, MockAgent } from 'undici'
import { afterEach, beforeEach, expect, it, describe, vi } from 'vitest'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'
import {
  createHttpDispatchers,
  EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS,
} from './http-dispatchers.mts'

describe('http-dispatchers', () => {
  let resources: ReturnType<typeof createHttpDispatchers>

  beforeEach(() => {
    resources = createHttpDispatchers()
  })

  afterEach(async () => {
    await resources[Symbol.asyncDispose]()
  })

  it('sets bounded routine headers and generous long-running headers and body gaps', () => {
    expect(EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS).toBe(60_000)
    expect(LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS).toBe(300_000)
    expect(EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS).toBe(300_000)
    expect(EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS).toBe(4_000)
    expect(EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS).toBe(600_000)
    expect(EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS).toBe(10_000)
  })

  it('uses distinct shared dispatchers for routine and long-running requests', () => {
    const routine = resources.getExternalRequestDispatcher()
    const longRunning = resources.getLongRunningExternalRequestDispatcher()

    expect(resources.getExternalRequestDispatcher()).toBe(routine)
    expect(resources.getLongRunningExternalRequestDispatcher()).toBe(longRunning)
    expect(longRunning).not.toBe(routine)
  })

  it('delegates both dispatcher profiles through the API egress guardrail', async () => {
    resources.enableApiEgressGuardrail()
    const server = createServer((_request, response) => {
      response.end('ok')
    })
    const address = await listen(server, '127.0.0.1')

    try {
      for (const dispatcher of [
        resources.getExternalRequestDispatcher(),
        resources.getLongRunningExternalRequestDispatcher(),
      ]) {
        const response = await undiciFetch(`http://127.0.0.1:${address.port}/`, { dispatcher })
        expect(await response.text()).toBe('ok')
      }
    } finally {
      await closeServer(server)
    }
  })

  it('closes both profiles once and shares concurrent close work after an error', async () => {
    const routine = resources.getExternalRequestDispatcher()
    const longRunning = resources.getLongRunningExternalRequestDispatcher()
    const routineClose = vi
      .spyOn(routine, 'close')
      .mockRejectedValueOnce(new Error('routine dispatcher already closed'))
    const longRunningClose = vi.spyOn(longRunning, 'close')
    try {
      const firstClose = resources.closeHttpDispatchers()
      expect(resources.closeHttpDispatchers()).toBe(firstClose)
      await firstClose
      expect(routineClose.mock.calls.filter(args => args.length === 0)).toHaveLength(1)
      expect(longRunningClose.mock.calls.filter(args => args.length === 0)).toHaveLength(1)
    } finally {
      routineClose.mockRestore()
      longRunningClose.mockRestore()
      await Promise.all([routine.destroy(), longRunning.destroy()])
    }
  })

  it('disposes one owner without replacing or closing another owner', async () => {
    await using other = createHttpDispatchers()
    const otherRoutine = other.getExternalRequestDispatcher()
    const otherLongRunning = other.getLongRunningExternalRequestDispatcher()
    const otherPinned = other.getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 }])
    const routineClose = vi.spyOn(otherRoutine, 'close')
    const longRunningClose = vi.spyOn(otherLongRunning, 'close')
    try {
      resources.enableApiEgressGuardrail()
      await resources[Symbol.asyncDispose]()
      expect(routineClose).not.toHaveBeenCalled()
      expect(longRunningClose).not.toHaveBeenCalled()
      expect(other.getExternalRequestDispatcher()).toBe(otherRoutine)
      expect(other.getLongRunningExternalRequestDispatcher()).toBe(otherLongRunning)
      expect(other.getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 }])).toBe(
        otherPinned,
      )
      expect(() =>
        resources.getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 }]),
      ).toThrow('Pinned dispatcher cache is closed')
    } finally {
      routineClose.mockRestore()
      longRunningClose.mockRestore()
    }
  })

  it('returns stable and distinct fetch functions for both profiles', () => {
    const routine = resources.getExternalFetch()
    const longRunning = resources.getLongRunningExternalFetch()

    expect(routine).toBeTypeOf('function')
    expect(longRunning).toBeTypeOf('function')
    expect(resources.getExternalFetch()).toBe(routine)
    expect(resources.getLongRunningExternalFetch()).toBe(longRunning)
    expect(longRunning).not.toBe(routine)
  })

  it('reuses the shared external request dispatcher', () => {
    const first = resources.getExternalRequestDispatcher()
    const second = resources.getExternalRequestDispatcher()

    expect(first).toBe(second)
  })

  it('reuses the same guarded dispatcher instance after the egress guardrail is enabled', () => {
    const rawRoutine = resources.getExternalRequestDispatcher()
    const rawLongRunning = resources.getLongRunningExternalRequestDispatcher()

    resources.enableApiEgressGuardrail()
    const guardedRoutine = resources.getExternalRequestDispatcher()
    const guardedLongRunning = resources.getLongRunningExternalRequestDispatcher()

    expect(guardedRoutine).not.toBe(rawRoutine)
    expect(guardedLongRunning).not.toBe(rawLongRunning)
    expect(guardedLongRunning).not.toBe(guardedRoutine)
    expect(resources.getExternalRequestDispatcher()).toBe(guardedRoutine)
    expect(resources.getLongRunningExternalRequestDispatcher()).toBe(guardedLongRunning)
  })

  it('preserves a caller-supplied dispatcher when composing the egress guardrail', async () => {
    const dispatcher = new MockAgent()
    dispatcher.disableNetConnect()
    dispatcher.get('http://localhost').intercept({ path: '/custom' }).reply(200, 'custom')
    resources.enableApiEgressGuardrail()

    try {
      const response = await resources.getExternalFetch()('http://localhost/custom', {
        dispatcher,
      } as RequestInit)
      expect(await response.text()).toBe('custom')
    } finally {
      await dispatcher.close()
    }
  })

  it('reuses a pinned dispatcher for the same resolved address set regardless of order', () => {
    const resolvedAddresses = [
      { address: '93.184.216.34', family: 4 as const },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 as const },
    ]

    const first = resources.getPinnedRequestDispatcher(resolvedAddresses)
    const second = resources.getPinnedRequestDispatcher([...resolvedAddresses].toReversed())

    expect(first).toBe(second)
  })

  it('creates distinct pinned dispatchers for distinct address sets', () => {
    const first = resources.getPinnedRequestDispatcher([
      { address: '93.184.216.34', family: 4 as const },
    ])
    const second = resources.getPinnedRequestDispatcher([
      { address: '93.184.216.35', family: 4 as const },
    ])

    expect(first).not.toBe(second)
  })

  it('preserves resolver address order when creating pinned dispatchers', async () => {
    const server = createServer((_request, response) => {
      response.end(response.socket?.remoteFamily)
    })
    const address = await listen(server, '::')

    try {
      const dispatcher = resources.getPinnedRequestDispatcher([
        { address: '::1', family: 6 as const },
        { address: '127.0.0.1', family: 4 as const },
      ])
      const response = await undiciFetch(`http://example.com:${address.port}/`, { dispatcher })

      expect(await response.text()).toBe('IPv6')
    } finally {
      await closeServer(server)
    }
  })

  it('closes the upstream pinned dispatcher cache once and makes it terminal', async () => {
    const dispatcher = resources.getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 }])
    const close = vi.spyOn(dispatcher, 'close').mockResolvedValueOnce()
    try {
      await Promise.all([resources.closeHttpDispatchers(), resources.closeHttpDispatchers()])
      expect(close.mock.calls.filter(args => args.length === 0)).toHaveLength(1)
      expect(() =>
        resources.getPinnedRequestDispatcher([{ address: '127.0.0.2', family: 4 }]),
      ).toThrow('Pinned dispatcher cache is closed')
    } finally {
      close.mockRestore()
      await dispatcher.destroy()
    }
  })

  it('swallows an upstream pinned-cache close rejection while disposing its owner', async () => {
    const dispatcher = resources.getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 }])
    const close = vi
      .spyOn(dispatcher, 'close')
      .mockRejectedValueOnce(new Error('pinned dispatcher already closed'))
    try {
      await expect(resources[Symbol.asyncDispose]()).resolves.toBeUndefined()
    } finally {
      close.mockRestore()
      await dispatcher.destroy()
    }
  })
})

async function listen(server: Server, host: string): Promise<{ port: number }> {
  const port = await listenOnEphemeralPort(server, host, {
    isAllowedPort: isFetchSafePort,
  })
  return { port }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}
