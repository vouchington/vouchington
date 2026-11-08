import {
  awaitReportedEnqueueAdmission,
  createBulkEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import type { UnfurlDispatchCursor, UnfurlReferralLinkEntry } from './types.mts'

const UNFURL_JOB_NAME = 'crawl.unfurl_referral_link'
const DISPATCHER_JOB_NAME = 'crawl.unfurl_referral_links_dispatcher'
const REMOVE_CHILDREN_JOB_NAME = 'crawl.remove_unfurled_children_for_user'

const enqueueUnfurlReferralLinkJob = createBackgroundCpuEnqueueFunction(UNFURL_JOB_NAME)
const enqueueUnfurlReferralLinksDispatcherJob =
  createBackgroundCpuEnqueueFunction(DISPATCHER_JOB_NAME)
const enqueueRemoveUnfurledChildrenForUserJob =
  createBackgroundCpuEnqueueFunction(REMOVE_CHILDREN_JOB_NAME)

function unfurlReferralLinkJobOptions(data: UnfurlReferralLinkEntry) {
  return {
    priority: PRIORITY_DEFAULT,
    ordering: { key: 'crawl:unfurl' },
    deduplication: {
      id: `${UNFURL_JOB_NAME}__${data.parentLinkId}`,
      mode: 'debounce' as const,
    },
  } satisfies Partial<JobOptions>
}

/** One batched add of `enqueueUnfurlReferralLink` jobs, each with its own dedup id and options. */
export const enqueueBulkUnfurlReferralLinks = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: UNFURL_JOB_NAME,
  defaults: requireBackgroundCpuJob(UNFURL_JOB_NAME).options,
  buildJob: (data: UnfurlReferralLinkEntry) => ({
    data: data satisfies BackgroundCpuJobPayloads[typeof UNFURL_JOB_NAME],
    opts: unfurlReferralLinkJobOptions(data),
  }),
})

/** Logical dedup id `unfurl_referral_link__<parentLinkId>` (debounce) -- a burst of re-requests
 * or dispatcher self-heal retries for the same parent collapse to one job. */
export function enqueueUnfurlReferralLink(data: UnfurlReferralLinkEntry): EnqueueReturnType {
  return enqueueUnfurlReferralLinkJob(data, unfurlReferralLinkJobOptions(data))
}

export function enqueueUnfurlReferralLinksDispatcher(
  cursor?: UnfurlDispatchCursor,
): EnqueueReturnType {
  return enqueueUnfurlReferralLinksDispatcherJob(cursor ? { cursor } : {}, {
    priority: PRIORITY_DISPATCHER,
    deduplication: { id: 'crawl:referral-unfurl-dispatcher', mode: 'simple' },
  })
}

/** Fired from the membership downgrade/expiry hook (decision #4 eager removal). Ordered and
 * deduplicated per user so a rapid double-downgrade doesn't race two removal jobs. */
export function enqueueRemoveUnfurledChildrenForUser(userId: string): EnqueueReturnType {
  return enqueueRemoveUnfurledChildrenForUserJob({ userId }, {
    priority: PRIORITY_DEFAULT,
    ordering: { key: `crawl:remove_unfurled_children__${userId}` },
    deduplication: {
      id: `${REMOVE_CHILDREN_JOB_NAME}__${userId}`,
      mode: 'debounce' as const,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueRemoveUnfurledChildrenForUserBestEffort(userId: string): Promise<void> {
  return awaitReportedEnqueueAdmission(() => {
    return enqueueRemoveUnfurledChildrenForUser(userId)
  })
}
