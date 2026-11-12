import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import type { BackgroundCpuJobDefinition, BackgroundCpuJobSpec } from '../types.mts'
import { defineBackgroundCpuDomain, defineBackgroundCpuJob } from './define-job.mts'

export const retainedBedrock = defineBackgroundCpuDomain({
  domain: 'bedrock-embeddings',
  workerConcurrency: 11,
})

const RETRY_5S = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
const RETRY_1S = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
type JobOverrides = Omit<Partial<BackgroundCpuJobSpec>, 'name' | 'priority'>
const task = (name: string, options: JobOverrides = {}): BackgroundCpuJobSpec => ({
  name,
  priority: PRIORITY_TASK,
  ...RETRY_5S,
  ...options,
})
const dispatch = (name: string, options: JobOverrides = {}): BackgroundCpuJobSpec => ({
  name,
  priority: PRIORITY_DISPATCH,
  ...RETRY_5S,
  ...options,
})

const retainedBedrockJob = (spec: BackgroundCpuJobSpec) =>
  defineBackgroundCpuJob(retainedBedrock, spec)

export const retainedBedrockJobs: readonly BackgroundCpuJobDefinition[] = [
  ...['topic', 'post', 'rss_feed_item'].map(name =>
    retainedBedrockJob(
      task(name, {
        ...RETRY_1S,
        ordering: {
          key: 'bedrock-embeddings:single',
          rateLimit: { max: 10, duration: 1_000 },
        },
      }),
    ),
  ),
  ...['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'].map(name =>
    retainedBedrockJob(
      task(`create_${name}`, {
        lockDuration: 300_000,
        ordering: { key: `bedrock-embeddings:creation:${name}` },
      }),
    ),
  ),
  retainedBedrockJob(
    task('poll_batch', {
      lockDuration: 300_000,
      ordering: {
        key: 'bedrock-embeddings:polling',
        rateLimit: { max: 10, duration: 1_000 },
      },
    }),
  ),
  ...[
    'poll_dispatcher',
    'creation_dispatcher',
    'backlog_dispatcher',
    'stale_cleanup_dispatcher',
  ].map(name =>
    retainedBedrockJob(
      dispatch(name, {
        lockDuration: 300_000,
        ordering: { key: 'bedrock-embeddings:dispatcher' },
      }),
    ),
  ),
  ...['reconcile_existing', 'post_trigger_recovery'].map(name =>
    retainedBedrockJob(
      dispatch(name, {
        lockDuration: 300_000,
        ordering: { key: 'bedrock-embeddings:reconciliation' },
      }),
    ),
  ),
]
