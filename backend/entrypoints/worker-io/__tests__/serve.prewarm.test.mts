import { describe, expect, it } from 'vitest'
import { registerWorkerServe } from '../serve-runtime.mts'

type ShutdownCallback = () => void | Promise<void>
type ProcessHandler = (...args: unknown[]) => void
type ProcessMock = Pick<NodeJS.Process, 'on' | 'env' | 'exit'>

function makeTimeoutMock(): typeof globalThis.setTimeout {
  const timeout = {} as NodeJS.Timeout
  return ((..._args: Parameters<typeof globalThis.setTimeout>) =>
    timeout) as typeof globalThis.setTimeout
}

function makeProcessMock(processHandlers: Map<string, ProcessHandler>): ProcessMock {
  return {
    // A literal, never the real process.env: this suite runs under pool: 'forks',
    // isolate: false, so mutating the real env here would bleed into sibling tests
    // sharing the fork — exactly the leak class this suite exists to avoid.
    env: { NODE_PREWARM: '1', NODE_PREWARM_PORT: '3099' },
    on: (event: string, handler: ProcessHandler) => {
      processHandlers.set(event, handler as ProcessHandler)
      return undefined as never
    },
    exit: () => undefined as never,
  }
}

describe('worker-io serve entrypoint (prewarm mode)', () => {
  it('starts an HTTP server on NODE_PREWARM_PORT when NODE_PREWARM is set', () => {
    const shutdownCallbacks: ShutdownCallback[] = []
    const listenedPorts: number[] = []
    const closedServers: string[] = []
    const processHandlers = new Map<string, ProcessHandler>()

    registerWorkerServe({
      workers: [{ close: async () => {} }],
      addGracefulShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return 1
      },
      onError: () => {},
      flushSentry: async () => {},
      createServer: () =>
        ({
          listen: (port: number) => {
            listenedPorts.push(port)
          },
          close: (callback?: () => void) => {
            closedServers.push('close')
            callback?.()
          },
          closeAllConnections: () => {
            closedServers.push('closeAllConnections')
          },
        }) as never,
      process: makeProcessMock(processHandlers),
      console: {
        log: () => {},
        error: () => {},
      },
      setTimeout: makeTimeoutMock(),
    })

    expect(listenedPorts).toEqual([3099])
    expect(shutdownCallbacks).toHaveLength(1)
    expect(processHandlers.has('uncaughtException')).toBe(true)
    expect(closedServers).toEqual([])
  })

  it('closes the prewarm server on graceful shutdown', async () => {
    const shutdownCallbacks: ShutdownCallback[] = []
    const closedServers: string[] = []
    const processHandlers = new Map<string, ProcessHandler>()

    registerWorkerServe({
      workers: [{ close: async () => {} }],
      addGracefulShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return 1
      },
      onError: () => {},
      flushSentry: async () => {},
      createServer: () =>
        ({
          listen: () => {},
          close: (callback?: () => void) => {
            closedServers.push('close')
            callback?.()
          },
          closeAllConnections: () => {
            closedServers.push('closeAllConnections')
          },
        }) as never,
      process: makeProcessMock(processHandlers),
      console: {
        log: () => {},
        error: () => {},
      },
      setTimeout: makeTimeoutMock(),
    })

    await shutdownCallbacks[0]!()

    expect(closedServers).toEqual(['closeAllConnections', 'close'])
  })
})
