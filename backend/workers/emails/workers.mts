import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import * as templates from './processors/index.mts'
import type { EmailDispatcherJobs, EmailJobs, EmailSendJobs } from '@queues/emails/types'
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
  const jobName = job.name as EmailJobs
  if (jobName === 'processSendCopyrightNoticeEmail') {
    return await processSendCopyrightNoticeEmail(job.data)
  }
  if (isDispatcherJob(jobName)) {
    return processEmailDispatcherJob(jobName, dispatchers)
  }
  return processEmail(
    templates,
    jobName as Exclude<EmailSendJobs, 'processSendCopyrightNoticeEmail'>,
    job.data.input,
    job.data.variables,
  )
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
