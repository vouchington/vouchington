import { describe } from 'vitest'

import { registerWorkerQueueClassTests } from '../../test-helpers/worker-queue-class-selection.mts'
import { initializeWorkerRuntime } from './runtime.mts'
import { CPU_ONLY_SCHEDULE_DEFINITIONS, SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'

const queueNames = (definitions: readonly { queueName: string }[]): string[] =>
  definitions.map(definition => definition.queueName)

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
    // worker-io registers the IO schedules, so a cpu-class worker-cpu must not repeat them.
    expectedSchedules: {
      all: queueNames(SCHEDULE_DEFINITIONS),
      cpu: queueNames(CPU_ONLY_SCHEDULE_DEFINITIONS),
    },
    alwaysRunSchedules: ['heartbeat'],
  })
})
