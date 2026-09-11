import { describe, expect, it } from 'vitest'
import type { WorkerRuntime, WorkerRuntimeConfig } from '@backend/worker-runtime'
import { initializeWorkerRuntime } from './runtime.mts'
import { SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'

describe('worker-cpu runtime bootstrap', () => {
  it('binds CPU definitions and process hooks to the shared lifecycle', async () => {
    let capturedConfig: WorkerRuntimeConfig | undefined
    let nativeShutdownCalls = 0
    let heartbeatCalls = 0
    const expectedRuntime: WorkerRuntime = {
      workers: [],
      sqsConsumers: [],
      startWorkerRuntime: async () => {},
    }

    const runtime = await initializeWorkerRuntime({
      initializeWorkerRuntime: async config => {
        capturedConfig = config
        return expectedRuntime
      },
      registerNativeAddonShutdown: () => {
        nativeShutdownCalls += 1
      },
      startGrafanaHeartbeat: () => {
        heartbeatCalls += 1
        return () => {}
      },
    })

    expect(runtime).toBe(expectedRuntime)
    expect(capturedConfig?.workerDefinitions).toBe(WORKER_DEFINITIONS)
    expect(capturedConfig?.sqsConsumerDefinitions).toBe(SQS_CONSUMER_DEFINITIONS)
    expect(capturedConfig?.scheduleDefinitions).toBe(SCHEDULE_DEFINITIONS)

    capturedConfig?.hooks?.afterLoad?.()
    capturedConfig?.hooks?.afterSuccessfulStart?.()
    expect(nativeShutdownCalls).toBe(1)
    expect(heartbeatCalls).toBe(1)
  })
})

describe('worker-cpu entrypoint wrapper', () => {
  it('initializes in prewarm mode and re-exports the runtime controls', async () => {
    const originalNodePrewarm = process.env.NODE_PREWARM
    const originalQueues = process.env.QUEUES

    try {
      process.env.NODE_PREWARM = '1'
      process.env.QUEUES = [...WORKER_DEFINITIONS, ...SQS_CONSUMER_DEFINITIONS]
        .map(definition => `-${definition.queueName}`)
        .join(',')

      const entrypoint = await import('./index.mts')

      expect(Array.isArray(entrypoint.default)).toBe(true)
      expect(Array.isArray(entrypoint.sqsConsumers)).toBe(true)
      expect(typeof entrypoint.startWorkerRuntime).toBe('function')
      expect(typeof entrypoint.reportWorkerLoadFailure).toBe('function')
      await Promise.all(entrypoint.default.map(worker => worker.close()))
      await Promise.all(entrypoint.sqsConsumers.map(consumer => consumer.close()))
    } finally {
      if (originalNodePrewarm === undefined) {
        delete process.env.NODE_PREWARM
      } else {
        process.env.NODE_PREWARM = originalNodePrewarm
      }

      if (originalQueues === undefined) {
        delete process.env.QUEUES
      } else {
        process.env.QUEUES = originalQueues
      }
    }
  })
})
