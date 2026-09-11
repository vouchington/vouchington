import { createServer, type Server } from 'node:http'
import { fetch as undiciFetch, MockAgent } from 'undici'
import { afterEach, expect, it, describe } from 'vitest'
import { isFetchSafePort } from '@ts-shared/utils/fetch-ports'
import { listenOnRunnerUnreservedEphemeralPort } from '../../../ci/runner-port-policy.mts'
import {
  closeHttpDispatchers,
  enableApiEgressGuardrail,
  getExternalFetch,
  getExternalRequestDispatcher,
  getLongRunningExternalFetch,
  getLongRunningExternalRequestDispatcher,
  getPinnedRequestDispatcher,
  resetHttpDispatchersForTest,
  EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  LONG_RUNNING_EXTERNAL_DISPATCHER_HEADERS_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_BODY_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_KEEP_ALIVE_MAX_TIMEOUT_MS,
  EXTERNAL_DISPATCHER_CONNECT_TIMEOUT_MS,
} from './http-dispatchers.mts'

describe('http-dispatchers', () => {
  afterEach(async () => {
    await resetHttpDispatchersForTest()
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
    const routine = getExternalRequestDispatcher()
    const longRunning = getLongRunningExternalRequestDispatcher()

    expect(getExternalRequestDispatcher()).toBe(routine)
    expect(getLongRunningExternalRequestDispatcher()).toBe(longRunning)
    expect(longRunning).not.toBe(routine)
  })

  it('delegates both dispatcher profiles through the API egress guardrail', async () => {
    enableApiEgressGuardrail()
    const server = createServer((_request, response) => {
      response.end('ok')
    })
    const address = await listen(server, '127.0.0.1')

    try {
      for (const dispatcher of [
        getExternalRequestDispatcher(),
        getLongRunningExternalRequestDispatcher(),
      ]) {
        const response = await undiciFetch(`http://127.0.0.1:${address.port}/`, { dispatcher })
        expect(await response.text()).toBe('ok')
      }
    } finally {
      await closeServer(server)
    }
  })

  it('closes and resets both shared dispatcher profiles together', async () => {
    const routine = getExternalRequestDispatcher()
    const longRunning = getLongRunningExternalRequestDispatcher()
    let routineWasClosed = false
    let longRunningWasClosed = false
    routine.close = async () => {
      routineWasClosed = true
      throw new Error('routine dispatcher already closed')
    }
    longRunning.close = async () => {
      longRunningWasClosed = true
    }

    await closeHttpDispatchers()

    expect(routineWasClosed).toBe(true)
    expect(longRunningWasClosed).toBe(true)

    await expect(resetHttpDispatchersForTest()).resolves.toBeUndefined()
    const freshRoutine = getExternalRequestDispatcher()
    const freshLongRunning = getLongRunningExternalRequestDispatcher()
    expect(freshRoutine).not.toBe(routine)
    expect(freshLongRunning).not.toBe(longRunning)
    expect(freshLongRunning).not.toBe(freshRoutine)
    await Promise.all([routine.destroy(), longRunning.destroy()])
  })

  it('closes both old shared agents when reset runs without prior shutdown', async () => {
    const routine = getExternalRequestDispatcher()
    const longRunning = getLongRunningExternalRequestDispatcher()
    let routineWasClosed = false
    let longRunningWasClosed = false
    routine.close = async () => {
      routineWasClosed = true
    }
    longRunning.close = async () => {
      longRunningWasClosed = true
    }

    await resetHttpDispatchersForTest()

    expect(routineWasClosed).toBe(true)
    expect(longRunningWasClosed).toBe(true)
    expect(getExternalRequestDispatcher()).not.toBe(routine)
    expect(getLongRunningExternalRequestDispatcher()).not.toBe(longRunning)
    await Promise.all([routine.destroy(), longRunning.destroy()])
  })

  it('returns stable and distinct fetch functions for both profiles', () => {
    const routine = getExternalFetch()
    const longRunning = getLongRunningExternalFetch()

    expect(routine).toBeTypeOf('function')
    expect(longRunning).toBeTypeOf('function')
    expect(getExternalFetch()).toBe(routine)
    expect(getLongRunningExternalFetch()).toBe(longRunning)
    expect(longRunning).not.toBe(routine)
  })

  it('reuses the shared external request dispatcher', () => {
    const first = getExternalRequestDispatcher()
    const second = getExternalRequestDispatcher()

    expect(first).toBe(second)
  })

  it('reuses the same guarded dispatcher instance after the egress guardrail is enabled', () => {
    const rawRoutine = getExternalRequestDispatcher()
    const rawLongRunning = getLongRunningExternalRequestDispatcher()

    enableApiEgressGuardrail()
    const guardedRoutine = getExternalRequestDispatcher()
    const guardedLongRunning = getLongRunningExternalRequestDispatcher()

    expect(guardedRoutine).not.toBe(rawRoutine)
    expect(guardedLongRunning).not.toBe(rawLongRunning)
    expect(guardedLongRunning).not.toBe(guardedRoutine)
    expect(getExternalRequestDispatcher()).toBe(guardedRoutine)
    expect(getLongRunningExternalRequestDispatcher()).toBe(guardedLongRunning)
  })

  it('preserves a caller-supplied dispatcher when composing the egress guardrail', async () => {
    const dispatcher = new MockAgent()
    dispatcher.disableNetConnect()
    dispatcher.get('http://localhost').intercept({ path: '/custom' }).reply(200, 'custom')
    enableApiEgressGuardrail()

    try {
      const response = await getExternalFetch()('http://localhost/custom', {
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

    const first = getPinnedRequestDispatcher(resolvedAddresses)
    const second = getPinnedRequestDispatcher([...resolvedAddresses].reverse())

    expect(first).toBe(second)
  })

  it('creates distinct pinned dispatchers for distinct address sets', () => {
    const first = getPinnedRequestDispatcher([{ address: '93.184.216.34', family: 4 as const }])
    const second = getPinnedRequestDispatcher([{ address: '93.184.216.35', family: 4 as const }])

    expect(first).not.toBe(second)
  })

  it('preserves resolver address order when creating pinned dispatchers', async () => {
    const server = createServer((_request, response) => {
      response.end(response.socket?.remoteFamily)
    })
    const address = await listen(server, '::')

    try {
      const dispatcher = getPinnedRequestDispatcher([
        { address: '::1', family: 6 as const },
        { address: '127.0.0.1', family: 4 as const },
      ])
      const response = await undiciFetch(`http://ordered.test:${address.port}/`, { dispatcher })

      expect(await response.text()).toBe('IPv6')
    } finally {
      await closeServer(server)
    }
  })

  it('closes the upstream pinned dispatcher cache once and makes it terminal', async () => {
    const dispatcher = getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 as const }])
    let closeCalls = 0
    dispatcher.close = async () => {
      closeCalls += 1
    }

    await Promise.all([closeHttpDispatchers(), closeHttpDispatchers()])

    expect(closeCalls).toBe(1)
    expect(() =>
      getPinnedRequestDispatcher([{ address: '127.0.0.2', family: 4 as const }]),
    ).toThrow('Pinned dispatcher cache is closed')
  })

  it('swallows an upstream pinned-cache close rejection while resetting test dispatchers', async () => {
    const dispatcher = getPinnedRequestDispatcher([{ address: '127.0.0.1', family: 4 as const }])
    dispatcher.close = async () => {
      throw new Error('pinned dispatcher already closed')
    }

    await expect(resetHttpDispatchersForTest()).resolves.toBeUndefined()
  })
})

async function listen(server: Server, host: string): Promise<{ port: number }> {
  const port = await listenOnRunnerUnreservedEphemeralPort(server, host, {
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
