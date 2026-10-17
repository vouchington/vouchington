import type {
  ProcessSendCommunityModerationSummaryEmailVariables,
  ProcessSendFollowNewsSourcesEmailVariables,
  ProcessSendFollowTopicsEmailVariables,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/background/enqueues/email-digests-domain'
import type { EmailTemplateInput } from '@queues/emails/types'

type EmailDigestTemplateVariables = {
  processSendFollowTopicsEmail: ProcessSendFollowTopicsEmailVariables
  processSendPostReferralLinkEmail: ProcessSendPostReferralLinkEmailVariables
  processSendFollowNewsSourcesEmail: ProcessSendFollowNewsSourcesEmailVariables
  processSendCommunityModerationSummaryEmail: ProcessSendCommunityModerationSummaryEmailVariables
}

export type EmailDigestTemplates = {
  [JobName in keyof EmailDigestTemplateVariables]: (
    input: EmailTemplateInput,
    variables: EmailDigestTemplateVariables[JobName],
  ) => Promise<unknown>
}
