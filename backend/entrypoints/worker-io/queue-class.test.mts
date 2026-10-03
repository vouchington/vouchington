import { describe } from 'vitest'

import { registerWorkerQueueClassTests } from '../../test-helpers/entrypoints/worker-queue-class-selection.mts'
import { initializeWorkerRuntime } from './runtime.mts'

describe('worker-io WORKER_QUEUE_CLASS selection', () => {
  registerWorkerQueueClassTests({
    initializeEntrypoint: initializeShared =>
      initializeWorkerRuntime({ initializeWorkerRuntime: initializeShared }),
    accepted: ['io'],
    rejected: ['all', 'cpu', 'gpu'],
    fullClass: 'io',
    explicitInclusionQueues: [],
  })
})
