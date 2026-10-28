import {
  createBulkEnqueueFunction,
  createEnqueueFunction,
  ENQUEUE_BASE_DEFAULTS,
} from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, PRIORITY_RECOVERY, QUEUE_NAME } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { TopicAliasJobs, TopicAliasUnlinkPage, TopicAliasUnlinkRecovery } from '../types.mts'

const PAGE_JOB: TopicAliasJobs = 'processUnlinkTopicAliasPage'
const RECOVERY_JOB: TopicAliasJobs = 'processRecoverTopicAliasUnlinks'

const pageDefaults = {
  ...ENQUEUE_BASE_DEFAULTS,
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}

const enqueuePage = createEnqueueFunction<TopicAliasUnlinkPage, TopicAliasJobs>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: PAGE_JOB,
  defaults: pageDefaults,
})

const enqueuePages = createBulkEnqueueFunction({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: PAGE_JOB,
  defaults: pageDefaults,
  buildJob: (page: TopicAliasUnlinkPage) => ({
    data: page,
    opts: pageJobOptions(page),
  }),
})

const enqueueRecovery = createEnqueueFunction<TopicAliasUnlinkRecovery, TopicAliasJobs>({
  queue: rssFeedMaintenance,
  queueName: QUEUE_NAME,
  jobName: RECOVERY_JOB,
  defaults: pageDefaults,
})

export function topicAliasUnlinkJobId(page: TopicAliasUnlinkPage): string {
  return `unlink-topic-alias__${page.topicAliasId}__${page.phase}__${page.pageCursor}`
}

export function topicAliasUnlinkPageOrdering(topicAliasId: string): {
  key: string
  concurrency: number
} {
  return {
    key: `topic-alias-unlink:${topicAliasId}`,
    concurrency: getPostPublicationWorkLimit('topic_alias_unlink_page_concurrency'),
  }
}

export function topicAliasUnlinkRecoveryOrdering(): { key: string; concurrency: number } {
  return {
    key: 'topic-alias-unlink:recovery',
    concurrency: getPostPublicationWorkLimit('topic_alias_unlink_recovery_concurrency'),
  }
}

function pageJobOptions(page: TopicAliasUnlinkPage) {
  return {
    jobId: topicAliasUnlinkJobId(page),
    priority: PRIORITY_DEFAULT,
    ordering: topicAliasUnlinkPageOrdering(page.topicAliasId),
  }
}

export function enqueueTopicAliasUnlinkPage(page: TopicAliasUnlinkPage): EnqueueReturnType {
  return enqueuePage(page, pageJobOptions(page))
}

export function enqueueTopicAliasUnlinkPages(
  pages: TopicAliasUnlinkPage[],
): ReturnType<typeof enqueuePages> {
  return enqueueBulkReactivatingFinished({
    queue: rssFeedMaintenance,
    inputs: pages,
    jobIdOf: topicAliasUnlinkJobId,
    enqueueBulk: enqueuePages,
  })
}

/** Scheduled seed passes no cursor. Each continuation uses a new job id. */
export function enqueueRecoverTopicAliasUnlinks(afterId: string | null = null): EnqueueReturnType {
  return enqueueRecovery(
    { afterId },
    {
      priority: PRIORITY_RECOVERY,
      ordering: topicAliasUnlinkRecoveryOrdering(),
      ...(afterId ? { jobId: `unlink-topic-alias-recovery__${afterId}` } : {}),
    },
  )
}
