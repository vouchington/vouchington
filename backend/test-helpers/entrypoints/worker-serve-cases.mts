import { expect } from 'vitest'

import {
  bootWorkerServe,
  makeWorker,
  type RegisterWorkerServe,
  type ShutdownCallback,
} from './worker-serve-harness.mts'

export type WorkerServeCase = {
  title: string
  run: () => void | Promise<void>
}

export function sharedWorkerServeCases(
  registerWorkerServe: RegisterWorkerServe,
): WorkerServeCase[] {
  return [
    {
      title: 'registers shutdown callback and exports workers',
      run: () => {
        const workers = [makeWorker(), makeWorker()]
        const shutdownCallbacks: ShutdownCallback[] = []
        const { processHandlers, returned } = bootWorkerServe(registerWorkerServe, {
          workers,
          shutdownCallbacks,
        })

        expect(shutdownCallbacks).toHaveLength(1)
        expect(returned).toBe(workers)
        expect(processHandlers.has('uncaughtException')).toBe(true)
        expect(processHandlers.has('unhandledRejection')).toBe(true)
      },
    },
    {
      title: 'closes all workers on graceful shutdown',
      run: async () => {
        let firstCloseCalls = 0
        let secondCloseCalls = 0
        const shutdownCallbacks: ShutdownCallback[] = []
        bootWorkerServe(registerWorkerServe, {
          workers: [
            makeWorker(async () => {
              firstCloseCalls += 1
            }),
            makeWorker(async () => {
              secondCloseCalls += 1
            }),
          ],
          shutdownCallbacks,
        })

        await shutdownCallbacks[0]!()
        expect(firstCloseCalls).toBe(1)
        expect(secondCloseCalls).toBe(1)
      },
    },
    {
      title: 'does not start a prewarm server when NODE_PREWARM_PORT is unset',
      run: () => {
        let createServerCalls = 0
        bootWorkerServe(registerWorkerServe, {
          env: { NODE_PREWARM: '1' },
          createServer: () => {
            createServerCalls += 1
            return { listen: () => {} }
          },
        })
        expect(createServerCalls).toBe(0)
      },
    },
    {
      title: 'routes uncaughtException errors to onError, flushes Sentry, and exits nonzero',
      run: async () => {
        const errors: Error[] = []
        let flushCalls = 0
        const exits: number[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          exits,
          onError: error => {
            errors.push(error)
          },
          flushSentry: async () => {
            flushCalls += 1
          },
        })

        processHandlers.get('uncaughtException')?.(new Error('uncaught test error'))
        await Promise.resolve()

        expect(errors).toEqual([new Error('uncaught test error')])
        expect(flushCalls).toBe(1)
        expect(exits).toEqual([1])
      },
    },
    {
      title: 'exits nonzero when Sentry flush rejects after uncaughtException',
      run: async () => {
        const exits: number[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          exits,
          flushSentry: async () => {
            throw new Error('flush failed')
          },
        })

        processHandlers.get('uncaughtException')?.(new Error('uncaught test error'))
        await Promise.resolve()
        expect(exits).toEqual([1])
      },
    },
  ]
}

export function cpuWorkerServeCases(registerWorkerServe: RegisterWorkerServe): WorkerServeCase[] {
  return [
    {
      title: 'wraps non-Error process errors before reporting',
      run: () => {
        const errors: Error[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          onError: error => {
            errors.push(error)
          },
        })

        processHandlers.get('uncaughtException')?.('string error')
        processHandlers.get('unhandledRejection')?.('rejected string')
        expect(errors).toEqual([new Error('string error'), new Error('rejected string')])
      },
    },
  ]
}

export function ioWorkerServeCases(registerWorkerServe: RegisterWorkerServe): WorkerServeCase[] {
  return [
    {
      title: 'wraps non-Error uncaughtException in Error before reporting',
      run: () => {
        const errors: Error[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          onError: error => {
            errors.push(error)
          },
        })

        processHandlers.get('uncaughtException')?.('string error')
        expect(errors).toEqual([new Error('string error')])
      },
    },
    {
      title: 'routes unhandledRejection to onError',
      run: () => {
        const errors: Error[] = []
        const { processHandlers } = bootWorkerServe(registerWorkerServe, {
          onError: error => {
            errors.push(error)
          },
        })

        processHandlers.get('unhandledRejection')?.(new Error('unhandled rejection'))
        expect(errors).toEqual([new Error('unhandled rejection')])
      },
    },
  ]
}
