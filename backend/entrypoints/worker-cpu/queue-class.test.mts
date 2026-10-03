import { describe } from 'vitest'

import { registerWorkerQueueClassTests } from '../../test-helpers/entrypoints/worker-queue-class-selection.mts'
import { initializeWorkerRuntime } from './runtime.mts'

describe('worker-cpu WORKER_QUEUE_CLASS selection', () => {
  registerWorkerQueueClassTests({
    initializeEntrypoint: initializeShared =>
      initializeWorkerRuntime({
        initializeWorkerRuntime: initializeShared,
        registerNativeAddonShutdown: () => {},
        startGrafanaHeartbeat: () => () => {},
      }),
    accepted: ['all', 'cpu'],
    rejected: ['io', 'gpu'],
    fullClass: 'all',
    explicitInclusionQueues: ['crawl_browser', 'unfurl_referral_links'],
  })
})
