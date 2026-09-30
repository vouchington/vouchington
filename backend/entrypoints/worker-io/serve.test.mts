import { describe } from 'vitest'

import { registerWorkerServeImportTest } from '../../test-helpers/entrypoints/worker-serve-import.mts'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

describe('worker-io serve entrypoint wrapper', () => {
  registerWorkerServeImportTest({
    workerDefinitions: WORKER_DEFINITIONS,
    sqsConsumerDefinitions: SQS_CONSUMER_DEFINITIONS,
    loadRuntime: async () => {
      await import('./serve.mts')
      return import('./index.mts')
    },
  })
})
