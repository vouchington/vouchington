import {
  createBulkEnqueueFunction as createGlideMqBulkEnqueueFunction,
  createEnqueueFunction as createGlideMqEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type {
  EmailJobs,
  EmailJobInput,
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendWelcomeEmailVariables,
  ProcessSendCopyrightNoticeEmailVariables,
} from './types.mts'
import { QUEUE_NAME } from './config.mts'
import { emails } from './queues.mts'
import { getEmailSendJobOptions } from './enqueues/job-options.mts'

export const enqueueSendCommunityInviteEmail =
  createEnqueueFunction<ProcessSendCommunityInviteEmailVariables>('processSendCommunityInviteEmail')

export const enqueueSendEmailAddressLoginToken =
  createEnqueueFunction<ProcessSendEmailAddressLoginTokenVariables>(
    'processSendEmailAddressLoginToken',
  )

export const enqueueSendDataExportReadyEmail =
  createEnqueueFunction<ProcessSendDataExportReadyEmailVariables>('processSendDataExportReadyEmail')

export const enqueueSendEmailVerificationToken =
  createEnqueueFunction<ProcessSendEmailVerificationTokenVariables>(
    'processSendEmailVerificationToken',
  )

export const enqueueSendWelcomeEmail =
  createEnqueueFunction<ProcessSendWelcomeEmailVariables>('processSendWelcomeEmail')

export const enqueueSendCommunityApplicationDecisionEmail =
  createEnqueueFunction<ProcessSendCommunityApplicationDecisionEmailVariables>(
    'processSendCommunityApplicationDecisionEmail',
  )

export const enqueueSendCommunityRoleChangeEmail =
  createEnqueueFunction<ProcessSendCommunityRoleChangeEmailVariables>(
    'processSendCommunityRoleChangeEmail',
  )

export const enqueueSendCommunityOwnershipTransferEmail =
  createEnqueueFunction<ProcessSendCommunityOwnershipTransferEmailVariables>(
    'processSendCommunityOwnershipTransferEmail',
  )

const enqueueSendCopyrightNoticeEmailJob = createGlideMqEnqueueFunction({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'processSendCopyrightNoticeEmail',
})

/** One batched add of `enqueueSendCopyrightNoticeEmail` jobs, each with its own dedup id. */
export const enqueueBulkSendCopyrightNoticeEmails = createGlideMqBulkEnqueueFunction<
  string,
  ProcessSendCopyrightNoticeEmailVariables,
  'processSendCopyrightNoticeEmail'
>({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'processSendCopyrightNoticeEmail',
  buildJob: intentId => ({
    data: { intentId } satisfies ProcessSendCopyrightNoticeEmailVariables,
    opts: copyrightNoticeEmailJobOptions(intentId),
  }),
})

function copyrightNoticeEmailJobOptions(intentId: string): Partial<JobOptions> {
  return {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    deduplication: {
      id: `copyright-delivery:${intentId}:email`,
      mode: 'throttle',
      ttl: 5 * 60 * 1000,
    },
  }
}

export function enqueueSendCopyrightNoticeEmail(intentId: string): EnqueueReturnType {
  return enqueueSendCopyrightNoticeEmailJob(
    { intentId } satisfies ProcessSendCopyrightNoticeEmailVariables,
    copyrightNoticeEmailJobOptions(intentId),
  )
}

function createEnqueueFunction<V extends Record<string, unknown>>(jobName: EmailJobs) {
  const enqueue = createGlideMqEnqueueFunction({
    queue: emails,
    queueName: QUEUE_NAME,
    jobName,
  })

  return (input: EmailJobInput, variables: V): EnqueueReturnType => {
    return enqueue({ input, variables }, getEmailSendJobOptions(jobName))
  }
}
