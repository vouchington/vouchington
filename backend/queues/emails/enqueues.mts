import { createEnqueueFunction as createGlideMqEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type {
  EmailJobs,
  EmailJobInput,
  ProcessSendCommunityApplicationDecisionEmailVariables,
  ProcessSendCommunityInviteEmailVariables,
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendCommunityOwnershipTransferEmailVariables,
  ProcessSendCommunityRoleChangeEmailVariables,
  ProcessSendDataExportReadyEmailVariables,
  ProcessSendEmailAddressLoginTokenVariables,
  ProcessSendEmailVerificationTokenVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
  ProcessSendSupportEmailVariables,
  ProcessSendWelcomeEmailVariables,
  ProcessSendCopyrightNoticeEmailVariables,
} from './types.mts'
import { QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from './config.mts'
import { emails } from './queues.mts'

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

export const enqueueSendFollowTopicsEmail =
  createEnqueueFunction<ProcessSendFollowTopicsEmailVariables>('processSendFollowTopicsEmail')

export const enqueueSendPostReferralLinkEmail =
  createEnqueueFunction<ProcessSendPostReferralLinkEmailVariables>(
    'processSendPostReferralLinkEmail',
  )

export const enqueueSendFollowNewsSourcesEmail =
  createEnqueueFunction<ProcessSendFollowNewsSourcesEmailVariables>(
    'processSendFollowNewsSourcesEmail',
  )

export const enqueueSendCommunityModerationSummaryEmail =
  createEnqueueFunction<ProcessSendCommunityModerationSummaryEmailVariables>(
    'processSendCommunityModerationSummaryEmail',
  )

export const enqueueSendSupportEmail =
  createEnqueueFunction<ProcessSendSupportEmailVariables>('processSendSupportEmail')

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

export function enqueueSendCopyrightNoticeEmail(intentId: string): EnqueueReturnType {
  return enqueueSendCopyrightNoticeEmailJob(
    { intentId } satisfies ProcessSendCopyrightNoticeEmailVariables,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `copyright-delivery:${intentId}:email`,
        mode: 'throttle',
        ttl: 5 * 60 * 1000,
      },
    },
  )
}

export function enqueueSendCopyrightEmailIntakeResponse(responseId: string): EnqueueReturnType {
  return enqueueSendCopyrightNoticeEmailJob(
    { intakeResponseId: responseId } satisfies ProcessSendCopyrightNoticeEmailVariables,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `copyright-email-intake-response:${responseId}:email`,
        mode: 'throttle',
        ttl: 5 * 60 * 1000,
      },
    },
  )
}

const enqueueDispatchEngagementEmailsJob = createGlideMqEnqueueFunction({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'dispatchEngagementEmails',
})

const enqueueDispatchCommunityModerationSummaryEmailsJob = createGlideMqEnqueueFunction({
  queue: emails,
  queueName: QUEUE_NAME,
  jobName: 'dispatchCommunityModerationSummaryEmails',
})

export function enqueueDispatchEngagementEmails(): EnqueueReturnType {
  return enqueueDispatchEngagementEmailsJob(
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DISPATCHER,
      deduplication: {
        id: 'dispatch_engagement_emails',
        mode: 'throttle',
        ttl: 3_600_000,
      },
    },
  )
}

export function enqueueDispatchCommunityModerationSummaryEmails(): EnqueueReturnType {
  return enqueueDispatchCommunityModerationSummaryEmailsJob(
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DISPATCHER,
      deduplication: {
        id: 'dispatch_community_moderation_summary_emails',
        mode: 'throttle',
        ttl: 55_000,
      },
    },
  )
}

function createEnqueueFunction<V extends Record<string, unknown>>(jobName: EmailJobs) {
  const enqueue = createGlideMqEnqueueFunction({
    queue: emails,
    queueName: QUEUE_NAME,
    jobName,
  })

  return (input: EmailJobInput, variables: V, priority?: number): EnqueueReturnType => {
    return enqueue({ input, variables }, { priority: priority ?? PRIORITY_DEFAULT })
  }
}
