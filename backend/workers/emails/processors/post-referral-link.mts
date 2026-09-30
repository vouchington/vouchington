import type {
  EmailTemplateInput,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/emails/types'
import { renderPostReferralLinkEmail } from '@email-templates/core'
import { isPostReferralLinkEmailStillEligible } from '@services/users/engagement-emails'
import { processEngagementRecommendationEmail } from './engagement-recommendation-email.mts'

export const processSendPostReferralLinkEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendPostReferralLinkEmailVariables,
): Promise<unknown> =>
  processEngagementRecommendationEmail({
    input,
    variables,
    emailType: 'post_referral_link',
    processorName: 'processSendPostReferralLinkEmail',
    isStillEligible: isPostReferralLinkEmailStillEligible,
    render: renderPostReferralLinkEmail,
  })
