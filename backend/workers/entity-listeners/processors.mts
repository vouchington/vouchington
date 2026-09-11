import type { EntityJobs, EntityJobsListeners } from '@queues/entity-listeners/types'

export default function processEntityListener(
  jobs: EntityJobsListeners,
  jobName: EntityJobs,
  data: Record<string, unknown>,
) {
  const fn = jobs[jobName]
  if (!fn || typeof fn !== 'function') throw new Error(`Entity listener job ${jobName} not found`)
  if (!data) throw new Error('Entity listener job .data is required')
  return fn(data)
}
