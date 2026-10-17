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
import { parseEmailDigestJob } from '@queues/email-digests/payload/job-payload'
import type { BackgroundJobDefinition } from '@queues/background/types'
import type { EmailDigestTemplates } from './types.mts'
import { dispatchCommunityModerationSummaryEmails } from '@services/communities/moderation-summary-emails'
import { dispatchEngagementEmails } from '@services/engagement-emails/dispatch-engagement-emails'
import {
  dispatchApiKeyExpiryReminders,
  processSendApiKeyExpiryReminder,
} from './processors/api-key-expiry.mts'
import * as templates from './processors/index.mts'

export type EmailDigestDispatchers = {
  dispatchEngagementEmails: typeof dispatchEngagementEmails
  dispatchCommunityModerationSummaryEmails: typeof dispatchCommunityModerationSummaryEmails
  dispatchApiKeyExpiryReminders: typeof dispatchApiKeyExpiryReminders
}

const defaultDispatchers: EmailDigestDispatchers = {
  dispatchEngagementEmails,
  dispatchCommunityModerationSummaryEmails,
  dispatchApiKeyExpiryReminders,
}

const DOMAIN_PREFIX = 'email-digests.'

/**
 * Runs one digest job by its local name. The payload is a trust boundary: a name and payload that
 * do not match the job's enqueue contract fail before any processor runs.
 */
export async function processEmailDigestJob(
  name: string,
  data: unknown,
  dispatchers: EmailDigestDispatchers = defaultDispatchers,
  digestTemplates: EmailDigestTemplates = templates,
): Promise<unknown> {
  const parsed = parseEmailDigestJob(name, data)
  switch (parsed.kind) {
    case 'api-key-expiry':
      return processSendApiKeyExpiryReminder(parsed.apiKeyId)
    case 'dispatcher':
      return runDispatcher(parsed.name, dispatchers, parsed.data)
    case 'template':
      return digestTemplates[parsed.name](parsed.input, parsed.variables as never)
  }
}

function runDispatcher(
  name: keyof EmailDigestDispatchers,
  dispatchers: EmailDigestDispatchers,
  data: { afterId?: string },
): Promise<unknown> {
  switch (name) {
    case 'dispatchApiKeyExpiryReminders':
      return dispatchers.dispatchApiKeyExpiryReminders(data)
    case 'dispatchEngagementEmails':
      return dispatchers.dispatchEngagementEmails()
    case 'dispatchCommunityModerationSummaryEmails':
      return dispatchers.dispatchCommunityModerationSummaryEmails()
  }
}

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
