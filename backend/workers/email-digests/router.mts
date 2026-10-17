import { parseEmailDigestJob } from '@queues/email-digests/payload/job-payload'
import { dispatchCommunityModerationSummaryEmails } from '@services/communities/moderation-summary-emails'
import { dispatchEngagementEmails } from '@services/engagement-emails/dispatch-engagement-emails'
import {
  dispatchApiKeyExpiryReminders,
  processSendApiKeyExpiryReminder,
} from './processors/api-key-expiry.mts'
import { processSendCommunityModerationSummaryEmail } from './processors/community-moderation-summary.mts'
import { processSendFollowNewsSourcesEmail } from './processors/follow-news-sources.mts'
import { processSendFollowTopicsEmail } from './processors/follow-topics.mts'
import { processSendPostReferralLinkEmail } from './processors/post-referral-link.mts'
import type { EmailDigestTemplates } from './types.mts'

type EmailDigestDispatchers = {
  dispatchEngagementEmails: typeof dispatchEngagementEmails
  dispatchCommunityModerationSummaryEmails: typeof dispatchCommunityModerationSummaryEmails
  dispatchApiKeyExpiryReminders: typeof dispatchApiKeyExpiryReminders
}

const defaultDispatchers: EmailDigestDispatchers = {
  dispatchEngagementEmails,
  dispatchCommunityModerationSummaryEmails,
  dispatchApiKeyExpiryReminders,
}

const defaultTemplates: EmailDigestTemplates = {
  processSendFollowTopicsEmail,
  processSendPostReferralLinkEmail,
  processSendFollowNewsSourcesEmail,
  processSendCommunityModerationSummaryEmail,
}

/**
 * Runs one digest job by its local name. The payload is a trust boundary: a name and payload that
 * do not match the job's enqueue contract fail before any processor runs.
 */
export async function processEmailDigestJob(
  name: string,
  data: unknown,
  dispatchers: EmailDigestDispatchers = defaultDispatchers,
  templates: EmailDigestTemplates = defaultTemplates,
): Promise<unknown> {
  const parsed = parseEmailDigestJob(name, data)
  switch (parsed.kind) {
    case 'api-key-expiry':
      return processSendApiKeyExpiryReminder(parsed.apiKeyId)
    case 'dispatcher':
      return runDispatcher(parsed.name, dispatchers, parsed.data)
    case 'template':
      return templates[parsed.name](parsed.input, parsed.variables as never)
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
