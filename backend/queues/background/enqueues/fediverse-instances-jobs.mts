import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

export const FEDIVERSE_INSTANCES_DOMAIN = defineBackgroundDomain({
  domain: 'fediverse-instances',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

export type ClassifyFediverseInstanceData = { topicId: string; hostnameId: string }

export const FEDIVERSE_INSTANCES_CLASSIFY_JOB = defineBackgroundJob<ClassifyFediverseInstanceData>(
  FEDIVERSE_INSTANCES_DOMAIN,
  {
    name: 'classifyFediverseInstance',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
)

export const FEDIVERSE_INSTANCES_JOBS = [FEDIVERSE_INSTANCES_CLASSIFY_JOB] as const
