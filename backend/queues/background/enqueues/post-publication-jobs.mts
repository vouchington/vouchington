import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_TASK, PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { POST_PUBLICATION_EFFECTS_ORDERING_KEY } from './ordering-caps.mts'

export const POST_PUBLICATION_DOMAIN = defineBackgroundDomain({
  domain: 'post-publication',
  workerConcurrency: 5,
})

export const POST_PUBLICATION_EFFECTS_JOB = defineBackgroundJob<PostPublicationEffectsJobData>(
  POST_PUBLICATION_DOMAIN,
  {
    name: 'apply-effects',
    priority: PRIORITY_TASK,
    sensitive: true,
    // Keep immutable preimages available through a datastore outage without retaining terminal PII.
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    ordering: { key: POST_PUBLICATION_EFFECTS_ORDERING_KEY },
  },
)

export type PublisherTypeFeedJobData = {
  changeId: string
  topicIds: string[]
  afterTopicId: string | null
}

export const PUBLISHER_TYPE_FEED_PUBLICATION_JOB = defineBackgroundJob<PublisherTypeFeedJobData>(
  POST_PUBLICATION_DOMAIN,
  {
    name: 'publisher-type-feeds',
    priority: PRIORITY_DISPATCH,
    ordering: { key: 'post-publication:publisher-type-feeds' },
    ...pagedDispatchJobOptions('rss'),
  },
)

export const POST_PUBLICATION_JOBS = [
  POST_PUBLICATION_EFFECTS_JOB,
  PUBLISHER_TYPE_FEED_PUBLICATION_JOB,
] as const
