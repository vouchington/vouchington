import type {
  EmailTemplateInput,
  ProcessSendFollowNewsSourcesEmailVariables,
} from '@queues/emails/types'
import { renderFollowNewsSourcesEmail } from '@email-templates/core'
import { isFollowNewsSourcesEmailStillEligible } from '@services/users/engagement-emails'
import { processEngagementRecommendationEmail } from './engagement-recommendation-email.mts'

export const processSendFollowNewsSourcesEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendFollowNewsSourcesEmailVariables,
): Promise<unknown> =>
  processEngagementRecommendationEmail({
    input,
    variables,
    emailType: 'follow_news_sources',
    processorName: 'processSendFollowNewsSourcesEmail',
    isStillEligible: isFollowNewsSourcesEmailStillEligible,
    render: renderFollowNewsSourcesEmail,
  })
