import { defineScheduledJobManifest as defineSharedManifest } from '@vouchington/worker-runtime/schedule-manifest'
import type { ScheduledJobDefinition, ScheduledJobManifest } from './types.mts'
import { createOperatorSurfaceValidator } from './validation.mts'

export function defineScheduledJobManifest(
  queueName: string,
  jobs: readonly ScheduledJobDefinition[],
): ScheduledJobManifest {
  return defineSharedManifest(queueName, jobs, {
    validateSurface: createOperatorSurfaceValidator(),
  })
}
