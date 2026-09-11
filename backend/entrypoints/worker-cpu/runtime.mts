import {
  initializeWorkerRuntime as initializeSharedWorkerRuntime,
  type WorkerRuntime,
  type WorkerRuntimeConfig,
} from '@backend/worker-runtime'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'
import { SCHEDULE_DEFINITIONS } from './schedule-definitions.mts'
import { startGrafanaHeartbeat } from './grafana-heartbeat.mts'
import { registerNativeAddonShutdown } from './nativeAddonShutdown.mts'

type WorkerCpuDependencies = {
  initializeWorkerRuntime: (config: WorkerRuntimeConfig) => Promise<WorkerRuntime>
  registerNativeAddonShutdown: typeof registerNativeAddonShutdown
  startGrafanaHeartbeat: typeof startGrafanaHeartbeat
}

const defaultWorkerCpuDependencies = {
  initializeWorkerRuntime: initializeSharedWorkerRuntime,
  registerNativeAddonShutdown,
  startGrafanaHeartbeat,
} satisfies WorkerCpuDependencies

export { reportWorkerLoadFailure } from '@backend/worker-runtime'

export function initializeWorkerRuntime(
  dependencies: WorkerCpuDependencies = defaultWorkerCpuDependencies,
): Promise<WorkerRuntime> {
  return dependencies.initializeWorkerRuntime({
    workerDefinitions: WORKER_DEFINITIONS,
    sqsConsumerDefinitions: SQS_CONSUMER_DEFINITIONS,
    scheduleDefinitions: SCHEDULE_DEFINITIONS,
    hooks: {
      afterLoad: dependencies.registerNativeAddonShutdown,
      afterSuccessfulStart: dependencies.startGrafanaHeartbeat,
    },
  })
}
