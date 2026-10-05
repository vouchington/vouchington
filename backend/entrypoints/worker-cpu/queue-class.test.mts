import { describe } from 'vitest'

import { registerWorkerQueueClassTests } from '../../test-helpers/worker-queue-class-selection.mts'
import { initializeWorkerRuntime } from './runtime.mts'
import { SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'
import { SCHEDULE_DEFINITIONS as IO_SCHEDULE_DEFINITIONS } from '@entrypoints/worker-io/definitions'

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
      cpu: queueNames(
        SCHEDULE_DEFINITIONS.filter(
          definition => !IO_SCHEDULE_DEFINITIONS.some(io => io.queueName === definition.queueName),
        ),
      ),
    },
    alwaysRunSchedules: ['heartbeat'],
  })
})
