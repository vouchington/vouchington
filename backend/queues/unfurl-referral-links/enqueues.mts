import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  UNFURL_REFERRAL_LINKS_DEFAULTS,
  UNFURL_REFERRAL_LINKS_ORDERING,
  UNFURL_REFERRAL_LINKS_QUEUE_NAME,
} from './config.mts'
import { unfurlReferralLinksQueue } from './queues.mts'
import type { UnfurlReferralLinksJobs } from './types.mts'

type UnfurlReferralLinkEntry = { parentLinkId: string }
type RemoveUnfurledChildrenForUserEntry = { userId: string }

const UNFURL_JOB_NAME: UnfurlReferralLinksJobs = 'unfurl_referral_link'
const DISPATCHER_JOB_NAME: UnfurlReferralLinksJobs = 'unfurl_referral_links_dispatcher'
const REMOVE_CHILDREN_JOB_NAME: UnfurlReferralLinksJobs = 'remove_unfurled_children_for_user'

const defaults = {
  attempts: UNFURL_REFERRAL_LINKS_DEFAULTS.attempts,
  backoff: UNFURL_REFERRAL_LINKS_DEFAULTS.backoff,
  removeOnComplete: UNFURL_REFERRAL_LINKS_DEFAULTS.removeOnComplete,
  removeOnFail: UNFURL_REFERRAL_LINKS_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueUnfurlReferralLinkJob = createEnqueueFunction<
  UnfurlReferralLinkEntry,
  UnfurlReferralLinksJobs
>({
  queue: unfurlReferralLinksQueue,
  queueName: UNFURL_REFERRAL_LINKS_QUEUE_NAME,
  jobName: UNFURL_JOB_NAME,
  defaults,
})

const enqueueUnfurlReferralLinksDispatcherJob = createEnqueueFunction<
  Record<string, never>,
  UnfurlReferralLinksJobs
>({
  queue: unfurlReferralLinksQueue,
  queueName: UNFURL_REFERRAL_LINKS_QUEUE_NAME,
  jobName: DISPATCHER_JOB_NAME,
  defaults,
})

const enqueueRemoveUnfurledChildrenForUserJob = createEnqueueFunction<
  RemoveUnfurledChildrenForUserEntry,
  UnfurlReferralLinksJobs
>({
  queue: unfurlReferralLinksQueue,
  queueName: UNFURL_REFERRAL_LINKS_QUEUE_NAME,
  jobName: REMOVE_CHILDREN_JOB_NAME,
  defaults,
})

/** Logical dedup id `unfurl_referral_link__<parentLinkId>` (debounce) -- a burst of re-requests
 * or dispatcher self-heal retries for the same parent collapse to one job. */
export function enqueueUnfurlReferralLink(data: UnfurlReferralLinkEntry): EnqueueReturnType {
  return enqueueUnfurlReferralLinkJob(data, {
    priority: PRIORITY_DEFAULT,
    ordering: UNFURL_REFERRAL_LINKS_ORDERING.unfurl,
    deduplication: {
      id: `unfurl_referral_link__${data.parentLinkId}`,
      mode: 'debounce' as const,
      ttl: UNFURL_REFERRAL_LINKS_DEFAULTS.deduplicationTtlMs,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueUnfurlReferralLinksDispatcher(): EnqueueReturnType {
  return enqueueUnfurlReferralLinksDispatcherJob(
    {},
    {
      priority: PRIORITY_DISPATCHER,
      ordering: UNFURL_REFERRAL_LINKS_ORDERING.dispatcher,
    },
  )
}

/** Fired from the membership downgrade/expiry hook (decision #4 eager removal). Ordered and
 * deduplicated per user so a rapid double-downgrade doesn't race two removal jobs. */
export function enqueueRemoveUnfurledChildrenForUser(userId: string): EnqueueReturnType {
  return enqueueRemoveUnfurledChildrenForUserJob({ userId }, {
    priority: PRIORITY_DEFAULT,
    ordering: { key: `remove_unfurled_children__${userId}`, concurrency: 1 },
    deduplication: {
      id: `remove_unfurled_children_for_user__${userId}`,
      mode: 'debounce' as const,
      ttl: UNFURL_REFERRAL_LINKS_DEFAULTS.deduplicationTtlMs,
    },
  } satisfies Partial<JobOptions>)
}
