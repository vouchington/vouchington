import type {
  EmailTemplateInput,
  ProcessSendFollowTopicsEmailVariables,
} from '@queues/emails/types'
import { renderFollowTopicsEmail } from '@email-templates/core'
import { isFollowTopicsEmailStillEligible } from '@services/users/engagement-emails'
import { processEngagementRecommendationEmail } from './engagement-recommendation-email.mts'

export const processSendFollowTopicsEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendFollowTopicsEmailVariables,
): Promise<unknown> =>
  processEngagementRecommendationEmail({
    input,
    variables,
    emailType: 'follow_topics',
    processorName: 'processSendFollowTopicsEmail',
    isStillEligible: isFollowTopicsEmailStillEligible,
    render: renderFollowTopicsEmail,
  })
