import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as templates from './processors/index.mts'
import type { EmailDispatcherJobs, EmailJobs } from '@queues/emails/types'
import { parseEmailJob } from '@queues/emails/payload/job-payload'
import { QUEUE_NAME } from '@queues/emails/config'
import processEmail from './processors.mts'
import type { Job } from 'glide-mq'
import { dispatchEngagementEmails } from '@services/engagement-emails/dispatch-engagement-emails'
import { dispatchCommunityModerationSummaryEmails } from '@services/communities/moderation-summary-emails'
import { processSendCopyrightNoticeEmail } from './processors/copyright-notice.mts'
import {
  dispatchApiKeyExpiryReminders,
  processSendApiKeyExpiryReminder,
} from './processors/api-key-expiry.mts'

type EmailWorkerDispatchers = {
  dispatchEngagementEmails: typeof dispatchEngagementEmails
  dispatchCommunityModerationSummaryEmails: typeof dispatchCommunityModerationSummaryEmails
  dispatchApiKeyExpiryReminders: typeof dispatchApiKeyExpiryReminders
}

const defaultDispatchers: EmailWorkerDispatchers = {
  dispatchEngagementEmails,
  dispatchCommunityModerationSummaryEmails,
  dispatchApiKeyExpiryReminders,
}

export const emails = createWorker(QUEUE_NAME, (job: Job) => processEmailJob(job), {
  concurrency: getWorkerConcurrency('emails', { baseline: 5 }),
})

export async function processEmailJob(
  job: Job,
  dispatchers: EmailWorkerDispatchers = defaultDispatchers,
): Promise<unknown> {
  const parsed = parseEmailJob(job.name, job.data)
  switch (parsed.kind) {
    case 'api-key-expiry':
      return processSendApiKeyExpiryReminder(parsed.apiKeyId)
    case 'copyright':
      return processSendCopyrightNoticeEmail(parsed.data)
    case 'dispatcher':
      return processEmailDispatcherJob(parsed.name, dispatchers)
    case 'template':
      return processEmail(templates, parsed.name, parsed.input, parsed.variables)
  }
}

export function isDispatcherJob(jobName: EmailJobs): jobName is EmailDispatcherJobs {
  return (
    jobName === 'dispatchEngagementEmails' ||
    jobName === 'dispatchCommunityModerationSummaryEmails' ||
    jobName === 'dispatchApiKeyExpiryReminders'
  )
}

function processEmailDispatcherJob(
  jobName: EmailDispatcherJobs,
  dispatchers: EmailWorkerDispatchers,
): Promise<void> {
  switch (jobName) {
    case 'dispatchApiKeyExpiryReminders':
      return dispatchers.dispatchApiKeyExpiryReminders()
    case 'dispatchEngagementEmails':
      return dispatchers.dispatchEngagementEmails()
    case 'dispatchCommunityModerationSummaryEmails':
      return dispatchers.dispatchCommunityModerationSummaryEmails()
  }
}
