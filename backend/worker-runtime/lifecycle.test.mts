import type { Worker } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  initializeWorkerRuntime,
  reportWorkerLoadFailure,
  type WorkerRuntimeConfig,
  type WorkerRuntimeDependencies,
  type WorkerRuntimeHooks,
} from './lifecycle.mts'
import type { SqsConsumer } from './sqs-consumer.mts'

function makeWorker(name: string): Worker {
  return { name } as Worker
}

function makeSqsConsumer(name: string): SqsConsumer {
  return { name } as SqsConsumer
}

function makeConfig(hooks?: WorkerRuntimeHooks): WorkerRuntimeConfig {
  return {
    workerDefinitions: [{ queueName: 'worker-queue' }] as never,
    sqsConsumerDefinitions: [{ queueName: 'sqs-queue' }] as never,
    scheduleDefinitions: [{ queueName: 'schedule-queue' }] as never,
    ...(hooks && { hooks }),
  }
}

function makeDependencies(
  overrides: Partial<WorkerRuntimeDependencies> = {},
): WorkerRuntimeDependencies {
  return {
    loadWorkers: async () => [],
    loadSqsConsumers: async () => [],
    loadUniversalWorkers: async () => [],
    addWorkerEventListeners: () => {},
    addSqsConsumerEventListeners: () => {},
    upsertSchedules: async () => {},
    setup: async () => {},
    onError: () => {},
    ...overrides,
  }
}

describe('worker lifecycle', () => {
  it('preserves Error instances when reporting load failures', () => {
    const reason = new Error('bad queue selection')
    const reportedErrors: Error[] = []

    expect(() => reportWorkerLoadFailure(reason, error => reportedErrors.push(error))).toThrow(
      'bad queue selection',
    )
    expect(reportedErrors).toEqual([reason])
    expect(reportedErrors[0]).toBe(reason)
  })

  it('normalizes non-Error reasons when reporting load failures', () => {
    const reportedErrors: Error[] = []

    expect(() =>
      reportWorkerLoadFailure('bad queue selection', error => reportedErrors.push(error)),
    ).toThrow('bad queue selection')
    expect(reportedErrors).toEqual([new Error('bad queue selection')])
  })

  it('loads every runtime concurrently and preserves queue-name and merge ordering', async () => {
    const workerGate = Promise.withResolvers<void>()
    const universalGate = Promise.withResolvers<void>()
    const sqsGate = Promise.withResolvers<void>()
    const policyWorker = makeWorker('policy')
    const universalWorker = makeWorker('universal')
    const sqsConsumer = makeSqsConsumer('sqs')
    const started: string[] = []
    const workerCalls: Parameters<WorkerRuntimeDependencies['loadWorkers']>[] = []
    const sqsCalls: Parameters<WorkerRuntimeDependencies['loadSqsConsumers']>[] = []
    const config = makeConfig()

    const initializing = initializeWorkerRuntime(
      config,
      makeDependencies({
        loadWorkers: async (...arguments_) => {
          started.push('workers')
          workerCalls.push(arguments_)
          await workerGate.promise
          return [policyWorker]
        },
        loadUniversalWorkers: async () => {
          started.push('universal')
          await universalGate.promise
          return [universalWorker]
        },
        loadSqsConsumers: async (...arguments_) => {
          started.push('sqs')
          sqsCalls.push(arguments_)
          await sqsGate.promise
          return [sqsConsumer]
        },
      }),
    )

    expect(started).toEqual(['workers', 'universal', 'sqs'])
    workerGate.resolve()
    universalGate.resolve()
    sqsGate.resolve()

    const runtime = await initializing
    expect(runtime.workers).toEqual([policyWorker, universalWorker])
    expect(runtime.sqsConsumers).toEqual([sqsConsumer])
    expect(workerCalls).toEqual([[config.workerDefinitions, undefined, undefined, ['sqs-queue']]])
    expect(sqsCalls).toEqual([
      [config.sqsConsumerDefinitions, undefined, undefined, ['worker-queue']],
    ])
  })

  it('wires listeners in order and repeats setup without repeating the success hook', async () => {
    const events: string[] = []
    const runtime = await initializeWorkerRuntime(
      makeConfig({ afterSuccessfulStart: () => events.push('success-hook') }),
      makeDependencies({
        loadWorkers: async () => [makeWorker('policy')],
        loadUniversalWorkers: async () => [makeWorker('universal')],
        loadSqsConsumers: async () => [makeSqsConsumer('sqs')],
        addWorkerEventListeners: worker => events.push(`worker:${worker.name}`),
        addSqsConsumerEventListeners: consumer => events.push(`sqs:${consumer.name}`),
        upsertSchedules: async () => {
          events.push('schedules')
        },
        setup: async () => {
          events.push('setup')
        },
      }),
    )

    await runtime.startWorkerRuntime()
    await runtime.startWorkerRuntime()

    expect(events).toEqual([
      'worker:policy',
      'worker:universal',
      'sqs:sqs',
      'schedules',
      'setup',
      'success-hook',
      'worker:policy',
      'worker:universal',
      'sqs:sqs',
      'schedules',
      'setup',
    ])
  })

  it('starts schedule registration and service setup concurrently', async () => {
    const schedulesGate = Promise.withResolvers<void>()
    const setupGate = Promise.withResolvers<void>()
    const started: string[] = []
    const runtime = await initializeWorkerRuntime(
      makeConfig(),
      makeDependencies({
        upsertSchedules: async () => {
          started.push('schedules')
          await schedulesGate.promise
        },
        setup: async () => {
          started.push('setup')
          await setupGate.promise
        },
      }),
    )

    const starting = runtime.startWorkerRuntime()
    expect(started).toEqual(['schedules', 'setup'])
    schedulesGate.resolve()
    setupGate.resolve()
    await starting
  })

  it('reports every settled startup failure without running the success hook', async () => {
    const scheduleError = new Error('schedule failed')
    const reportedErrors: Error[] = []
    let successHookCalls = 0
    const runtime = await initializeWorkerRuntime(
      makeConfig({
        afterSuccessfulStart: () => {
          successHookCalls += 1
        },
      }),
      makeDependencies({
        upsertSchedules: async () => {
          throw scheduleError
        },
        setup: () => Promise.reject('setup failed'),
        onError: error => reportedErrors.push(error),
      }),
    )

    await expect(runtime.startWorkerRuntime()).resolves.toBeUndefined()
    expect(reportedErrors).toEqual([scheduleError, new Error('setup failed')])
    expect(successHookCalls).toBe(0)
  })

  it('reports and rethrows a normalized initialization failure', async () => {
    const events: string[] = []
    let reportedError: Error | undefined

    const thrownError = await initializeWorkerRuntime(
      makeConfig(),
      makeDependencies({
        loadWorkers: () => Promise.reject('worker loading failed'),
        onError: error => {
          reportedError = error
          events.push('reported')
        },
      }),
    ).then(
      () => new Error('expected initialization to fail'),
      error => {
        events.push('thrown')
        return error
      },
    )

    expect(thrownError).toBe(reportedError)
    expect(reportedError).toEqual(new Error('worker loading failed'))
    expect(events).toEqual(['reported', 'thrown'])
  })

  it('runs the after-load hook only after every runtime loads', async () => {
    const workerGate = Promise.withResolvers<void>()
    let afterLoadCalls = 0
    const initializing = initializeWorkerRuntime(
      makeConfig({
        afterLoad: () => {
          afterLoadCalls += 1
        },
      }),
      makeDependencies({
        loadWorkers: async () => {
          await workerGate.promise
          return []
        },
      }),
    )

    await Promise.resolve()
    expect(afterLoadCalls).toBe(0)
    workerGate.resolve()
    await initializing
    expect(afterLoadCalls).toBe(1)
  })

  it('reports a failed success hook and permits a retry', async () => {
    const reportedErrors: Error[] = []
    let successHookCalls = 0
    const heartbeatFailure: unknown = 'heartbeat failed'
    const runtime = await initializeWorkerRuntime(
      makeConfig({
        afterSuccessfulStart: () => {
          successHookCalls += 1
          if (successHookCalls === 1) throw heartbeatFailure
        },
      }),
      makeDependencies({ onError: error => reportedErrors.push(error) }),
    )

    await expect(runtime.startWorkerRuntime()).rejects.toThrow('heartbeat failed')
    await expect(runtime.startWorkerRuntime()).resolves.toBeUndefined()
    await expect(runtime.startWorkerRuntime()).resolves.toBeUndefined()

    expect(reportedErrors).toEqual([new Error('heartbeat failed')])
    expect(successHookCalls).toBe(2)
  })
})
