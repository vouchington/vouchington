import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB,
  EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB,
  EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB,
  EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB,
  EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB,
} from '@queues/background/enqueues/email-digests-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { processEmailDigestJob } from './router.mts'

const DOMAIN_PREFIX = 'email-digests.'

function digestHandler<TData>(job: BackgroundJobDefinition<TData>) {
  const localName = job.name.slice(DOMAIN_PREFIX.length)
  return backgroundHandler(job, queued => processEmailDigestJob(localName, queued.data))
}

export const emailDigestsHandlers = [
  digestHandler(EMAIL_DIGESTS_DISPATCH_ENGAGEMENT_JOB),
  digestHandler(EMAIL_DIGESTS_DISPATCH_MODERATION_SUMMARY_JOB),
  digestHandler(EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB),
  digestHandler(EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB),
  digestHandler(EMAIL_DIGESTS_SEND_POST_REFERRAL_LINK_JOB),
  digestHandler(EMAIL_DIGESTS_SEND_FOLLOW_NEWS_SOURCES_JOB),
  digestHandler(EMAIL_DIGESTS_SEND_MODERATION_SUMMARY_JOB),
  digestHandler(EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB),
]
