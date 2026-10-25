import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
  type ScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME, backgroundQueueConfig } from '../config.mts'
import { background } from '../queues.mts'

/**
 * One manifest for the whole queue. Registration removes every scheduler a manifest does not list,
 * so each domain's manifest registered on its own would delete the other domains' schedulers.
 */
export function combineBackgroundManifests(
  domainManifests: readonly ScheduledJobManifest[],
): ScheduledJobManifest {
  return defineScheduledJobManifest(
    BACKGROUND_QUEUE_NAME,
    domainManifests.flatMap(manifest => manifest.jobs),
  )
}

export async function upsertBackgroundSchedules(
  domainManifests: readonly ScheduledJobManifest[],
): Promise<void> {
  await backgroundQueueConfig.waitForInitialization()
  await upsertScheduledJobManifest(background, combineBackgroundManifests(domainManifests))
}
