import type { EmailDispatcherJobs, EmailJobs, EmailSendJobs } from '../types.mts'
import { asRecord, assertExactKeys, optionalString } from './job-payload-read.mts'

type EmailJobKinds = {
  [Name in EmailJobs]: Name extends EmailDispatcherJobs
    ? 'dispatcher'
    : Name extends 'processSendCopyrightNoticeEmail'
      ? 'copyright'
      : Name extends 'processSendApiKeyExpiryReminder'
        ? 'api-key-expiry'
        : Name extends EmailSendJobs
          ? 'template'
          : never
}

const jobKinds = {
  dispatchEngagementEmails: 'dispatcher',
  dispatchCommunityModerationSummaryEmails: 'dispatcher',
  dispatchApiKeyExpiryReminders: 'dispatcher',
  processSendCommunityInviteEmail: 'template',
  processSendEmailAddressLoginToken: 'template',
  processSendDataExportReadyEmail: 'template',
  processSendEmailVerificationToken: 'template',
  processSendFollowTopicsEmail: 'template',
  processSendPostReferralLinkEmail: 'template',
  processSendFollowNewsSourcesEmail: 'template',
  processSendCommunityModerationSummaryEmail: 'template',
  processSendWelcomeEmail: 'template',
  processSendCommunityApplicationDecisionEmail: 'template',
  processSendCommunityRoleChangeEmail: 'template',
  processSendCommunityOwnershipTransferEmail: 'template',
  processSendCopyrightNoticeEmail: 'copyright',
  processSendApiKeyExpiryReminder: 'api-key-expiry',
} as const satisfies EmailJobKinds

export function getEmailJobKind(name: string): EmailJobKinds[EmailJobs] | undefined {
  return Object.hasOwn(jobKinds, name) ? jobKinds[name as EmailJobs] : undefined
}

export function dispatcherPayload(name: EmailDispatcherJobs, data: unknown): { afterId?: string } {
  const record = asRecord(data ?? {}, 'payload')
  assertExactKeys(record, name === 'dispatchApiKeyExpiryReminders' ? ['afterId'] : [])
  optionalString(record, 'afterId')
  return typeof record.afterId === 'string' ? { afterId: record.afterId } : {}
}
