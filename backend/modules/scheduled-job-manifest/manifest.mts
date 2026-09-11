import type { ScheduledJobDefinition, ScheduledJobManifest } from './types.mts'
import { validateScheduledJobManifests } from './validation.mts'

export function defineScheduledJobManifest(
  queueName: string,
  jobs: readonly ScheduledJobDefinition[],
): ScheduledJobManifest {
  const manifest = { queueName, jobs }
  validateScheduledJobManifests([manifest])
  return manifest
}
