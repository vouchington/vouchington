import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { parseEmailJob } from '@queues/emails/payload/job-payload'
import { QUEUE_NAME } from '@queues/emails/config'
import processEmail from './processors.mts'
import type { Job } from 'glide-mq'
import type { EmailJobsTemplates } from '@queues/emails/types'
import { processSendAccountSecurityEmail } from './processors/account-security.mts'
import { processSendEmailAddressLoginToken } from './processors/authentication.mts'
import { processSendCommunityApplicationDecisionEmail } from './processors/community-application-decision.mts'
import { processSendCommunityInviteEmail } from './processors/community-invite.mts'
import { processSendCommunityOwnershipTransferEmail } from './processors/community-ownership-transfer.mts'
import { processSendCommunityRoleChangeEmail } from './processors/community-role-change.mts'
import { processSendDataExportReadyEmail } from './processors/data-export-ready.mts'
import { processSendEmailVerificationToken } from './processors/email-verification.mts'
import { processSendReauthenticationToken } from './processors/reauthentication.mts'
import { processSendWelcomeEmail } from './processors/welcome.mts'
import { processSendCopyrightNoticeEmail } from './processors/copyright-notice.mts'

const templates: EmailJobsTemplates = {
  processSendAccountSecurityEmail,
  processSendCommunityApplicationDecisionEmail,
  processSendCommunityInviteEmail,
  processSendCommunityOwnershipTransferEmail,
  processSendCommunityRoleChangeEmail,
  processSendDataExportReadyEmail,
  processSendEmailAddressLoginToken,
  processSendEmailVerificationToken,
  processSendReauthenticationToken,
  processSendWelcomeEmail,
}

export const emails = createWorker(QUEUE_NAME, (job: Job<unknown>) => processEmailJob(job), {
  concurrency: getWorkerConcurrency('emails', { baseline: 5 }),
})

async function processEmailJob(job: Job<unknown>): Promise<unknown> {
  const parsed = parseEmailJob(job.name, job.data)
  switch (parsed.kind) {
    case 'copyright':
      return processSendCopyrightNoticeEmail(parsed.data)
    case 'template':
      return processEmail(templates, parsed.name, parsed.input, parsed.variables)
  }
}
