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

type EmailWorkerDispatchers = {
  dispatchEngagementEmails: typeof dispatchEngagementEmails
  dispatchCommunityModerationSummaryEmails: typeof dispatchCommunityModerationSummaryEmails
}

const defaultDispatchers: EmailWorkerDispatchers = {
  dispatchEngagementEmails,
  dispatchCommunityModerationSummaryEmails,
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
    jobName === 'dispatchEngagementEmails' || jobName === 'dispatchCommunityModerationSummaryEmails'
  )
}

function processEmailDispatcherJob(
  jobName: EmailDispatcherJobs,
  dispatchers: EmailWorkerDispatchers,
): Promise<void> {
  switch (jobName) {
    case 'dispatchEngagementEmails':
      return dispatchers.dispatchEngagementEmails()
    case 'dispatchCommunityModerationSummaryEmails':
      return dispatchers.dispatchCommunityModerationSummaryEmails()
  }
}
