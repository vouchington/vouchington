import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
  type ScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { ScheduledJobQueue } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_CPU_QUEUE_NAME, backgroundCpuQueueConfig } from '../config.mts'
import { backgroundCpu } from '../queues.mts'

/** Register every CPU domain together: reconciliation removes schedulers missing from the manifest. */
export function combineBackgroundCpuManifests(
  domainManifests: readonly ScheduledJobManifest[],
): ScheduledJobManifest {
  return defineScheduledJobManifest(
    BACKGROUND_CPU_QUEUE_NAME,
    domainManifests.flatMap(manifest => manifest.jobs),
  )
}

export async function upsertBackgroundCpuSchedules(
  domainManifests: readonly ScheduledJobManifest[],
  queue: ScheduledJobQueue = backgroundCpu,
): Promise<void> {
  await backgroundCpuQueueConfig.waitForInitialization()
  await upsertScheduledJobManifest(queue, combineBackgroundCpuManifests(domainManifests))
}
