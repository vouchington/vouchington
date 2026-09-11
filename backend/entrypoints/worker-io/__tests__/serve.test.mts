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
    env: {},
    on: (event: string, handler: ProcessHandler) => {
      processHandlers.set(event, handler as ProcessHandler)
      return undefined as never
    },
    exit: () => undefined as never,
  }
}

function makeWorker() {
  return {
    close: async () => {},
  }
}

describe('worker-io serve entrypoint', () => {
  it('registers shutdown callback and exports workers', () => {
    const workers = [makeWorker(), makeWorker()]
    const shutdownCallbacks: ShutdownCallback[] = []
    const processHandlers = new Map<string, ProcessHandler>()

    const returnedWorkers = registerWorkerServe({
      workers,
      addGracefulShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return 1
      },
      onError: () => {},
      flushSentry: async () => {},
      createServer: () =>
        ({
          listen: () => {},
        }) as never,
      process: makeProcessMock(processHandlers),
      console: {
        log: () => {},
        error: () => {},
      },
      setTimeout: makeTimeoutMock(),
    })

    expect(shutdownCallbacks).toHaveLength(1)
    expect(returnedWorkers).toBe(workers)
    expect(processHandlers.has('uncaughtException')).toBe(true)
    expect(processHandlers.has('unhandledRejection')).toBe(true)
  })

  it('closes all workers on graceful shutdown', async () => {
    let firstCloseCalls = 0
    let secondCloseCalls = 0
    const workers = [
      {
        close: async () => {
          firstCloseCalls += 1
        },
      },
      {
        close: async () => {
          secondCloseCalls += 1
        },
      },
    ]
    const shutdownCallbacks: ShutdownCallback[] = []

    registerWorkerServe({
      workers,
      addGracefulShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return 1
      },
      onError: () => {},
      flushSentry: async () => {},
      createServer: () =>
        ({
          listen: () => {},
        }) as never,
      process: {
        env: {},
        on: (_event: string, _handler: ProcessHandler) => undefined as never,
        exit: () => undefined as never,
      },
      console: {
        log: () => {},
        error: () => {},
      },
      setTimeout: makeTimeoutMock(),
    })

    await shutdownCallbacks[0]!()

    expect(firstCloseCalls).toBe(1)
    expect(secondCloseCalls).toBe(1)
  })

  it('does not start a prewarm server when NODE_PREWARM_PORT is unset', () => {
    const processHandlers = new Map<string, ProcessHandler>()
    let createServerCalls = 0

    registerWorkerServe({
      workers: [makeWorker()],
      addGracefulShutdownCallback: () => 1,
      onError: () => {},
      flushSentry: async () => {},
      createServer: () => {
        createServerCalls += 1
        return { listen: () => {} } as never
      },
      process: {
        ...makeProcessMock(processHandlers),
        env: { NODE_PREWARM: '1' },
      },
      console: {
        log: () => {},
        error: () => {},
      },
      setTimeout: makeTimeoutMock(),
    })

    expect(createServerCalls).toBe(0)
  })

  describe('process error handlers', () => {
    it('routes uncaughtException errors to onError, flushes Sentry, and exits nonzero', async () => {
      const errors: Error[] = []
      let flushCalls = 0
      const exits: number[] = []
      const processHandlers = new Map<string, ProcessHandler>()

      registerWorkerServe({
        workers: [makeWorker()],
        addGracefulShutdownCallback: () => 1,
        onError: error => {
          errors.push(error)
        },
        flushSentry: async () => {
          flushCalls += 1
        },
        createServer: () =>
          ({
            listen: () => {},
          }) as never,
        process: {
          ...makeProcessMock(processHandlers),
          exit: (code?: number) => {
            exits.push(code ?? 0)
            return undefined as never
          },
        },
        console: {
          log: () => {},
          error: () => {},
        },
        setTimeout: makeTimeoutMock(),
      })

      processHandlers.get('uncaughtException')?.(new Error('uncaught test error'))
      await Promise.resolve()

      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual(new Error('uncaught test error'))
      expect(flushCalls).toBe(1)
      expect(exits).toEqual([1])
    })

    it('exits nonzero when Sentry flush rejects after uncaughtException', async () => {
      const exits: number[] = []
      const processHandlers = new Map<string, ProcessHandler>()

      registerWorkerServe({
        workers: [makeWorker()],
        addGracefulShutdownCallback: () => 1,
        onError: () => {},
        flushSentry: async () => {
          throw new Error('flush failed')
        },
        createServer: () =>
          ({
            listen: () => {},
          }) as never,
        process: {
          ...makeProcessMock(processHandlers),
          exit: (code?: number) => {
            exits.push(code ?? 0)
            return undefined as never
          },
        },
        console: {
          log: () => {},
          error: () => {},
        },
        setTimeout: makeTimeoutMock(),
      })

      processHandlers.get('uncaughtException')?.(new Error('uncaught test error'))
      await Promise.resolve()

      expect(exits).toEqual([1])
    })

    it('wraps non-Error uncaughtException in Error before reporting', () => {
      const errors: Error[] = []
      const processHandlers = new Map<string, ProcessHandler>()

      registerWorkerServe({
        workers: [makeWorker()],
        addGracefulShutdownCallback: () => 1,
        onError: error => {
          errors.push(error)
        },
        flushSentry: async () => {},
        createServer: () =>
          ({
            listen: () => {},
          }) as never,
        process: makeProcessMock(processHandlers),
        console: {
          log: () => {},
          error: () => {},
        },
        setTimeout: makeTimeoutMock(),
      })

      processHandlers.get('uncaughtException')?.('string error')

      expect(errors).toEqual([new Error('string error')])
    })

    it('routes unhandledRejection to onError', () => {
      const errors: Error[] = []
      const processHandlers = new Map<string, ProcessHandler>()

      registerWorkerServe({
        workers: [makeWorker()],
        addGracefulShutdownCallback: () => 1,
        onError: error => {
          errors.push(error)
        },
        flushSentry: async () => {},
        createServer: () =>
          ({
            listen: () => {},
          }) as never,
        process: makeProcessMock(processHandlers),
        console: {
          log: () => {},
          error: () => {},
        },
        setTimeout: makeTimeoutMock(),
      })

      processHandlers.get('unhandledRejection')?.(new Error('unhandled rejection'))

      expect(errors).toEqual([new Error('unhandled rejection')])
    })
  })
})
