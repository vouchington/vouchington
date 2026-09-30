import type { EmailTemplateInput } from '@queues/emails/types'
import onError from '@modules/on-error'
import { getMarketingPostalAddress } from '@modules/utils'
import { sendClassifiedEmail } from '@services/email-classification'
import { createEmailUnsubscribeUrl } from '@services/users'
import {
  hasEngagementEmailSent,
  isEngagementEmailsEnabled,
  markEngagementEmailDeliveryAttempted,
  markEngagementEmailSent,
  releaseUnsentEngagementEmailClaim,
} from '@services/users/engagement-emails'
import { resolveEmailRecipient } from './recipient.mts'

type EngagementRecommendationEmailKind =
  | {
      emailType: 'follow_topics'
      processorName: 'processSendFollowTopicsEmail'
    }
  | {
      emailType: 'post_referral_link'
      processorName: 'processSendPostReferralLinkEmail'
    }
  | {
      emailType: 'follow_news_sources'
      processorName: 'processSendFollowNewsSourcesEmail'
    }

type RecommendationEmailVariables = {
  uiLocale?: string | null
  physicalAddress?: string
  unsubscribeUrl: string
}

type RecommendationEmailRenderProps<Variables extends RecommendationEmailVariables> = Omit<
  Variables,
  'physicalAddress'
> & {
  physicalAddress: string
  uiLocale?: string | null
  unsubscribeUrl: string
}

type RenderedRecommendationEmail = {
  subject: string
  html: string
  text: string
}

type EngagementRecommendationEmailOptions<Variables extends RecommendationEmailVariables> =
  EngagementRecommendationEmailKind & {
    input: EmailTemplateInput
    variables: Variables
    isStillEligible: (userId: string) => Promise<boolean>
    render: (
      props: RecommendationEmailRenderProps<Variables>,
    ) => Promise<RenderedRecommendationEmail>
  }

export async function processEngagementRecommendationEmail<
  Variables extends RecommendationEmailVariables,
>(options: EngagementRecommendationEmailOptions<Variables>): Promise<unknown> {
  const { input, variables, emailType, processorName, isStillEligible, render } = options
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') {
    await releaseUnsentEngagementEmailClaim(recipient.userId, emailType)
    return recipient
  }
  const emailAddress = recipient.emailAddress
  if (input.userId) {
    if (!(await isEngagementEmailsEnabled(input.userId))) return null
    if (await hasEngagementEmailSent(input.userId, emailType)) return null
    if (!(await isStillEligible(input.userId))) return null
  }
  const { subject, html, text } = await render({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
    physicalAddress: variables.physicalAddress ?? getMarketingPostalAddress(),
    ...(input.userId
      ? {
          unsubscribeUrl: createEmailUnsubscribeUrl(input.userId, 'outcome_emails'),
        }
      : {}),
  })
  if (input.userId) {
    if (!(await markEngagementEmailDeliveryAttempted(input.userId, emailType))) {
      /* c8 ignore next -- Defensive observability for concurrent processor races. */
      reportEngagementMarkSkipped(input.userId, emailType)
      return null
    }
  }
  const result = await sendClassifiedEmail(processorName, {
    to: emailAddress,
    subject,
    html,
    text,
    userId: input.userId,
  })
  if (input.userId) {
    try {
      if (!(await markEngagementEmailSent(input.userId, emailType))) {
        /* c8 ignore next -- Defensive observability for concurrent processor races. */
        reportEngagementMarkSkipped(input.userId, emailType)
      }
    } catch (error) {
      /* c8 ignore next -- Avoid retrying after SES accepted the message. */
      reportEngagementMarkFailed(error, input.userId, emailType)
    }
  }
  return result
}

/* c8 ignore start -- Defensive observability for post-send mark failures and races. */
function reportEngagementMarkFailed(
  error: unknown,
  userId: string,
  emailType: EngagementRecommendationEmailKind['emailType'],
): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'engagement-email-processor', emailType, phase: 'mark-sent' },
    extra: { userId },
  })
  onError(reportableError)
}

function reportEngagementMarkSkipped(
  userId: string,
  emailType: EngagementRecommendationEmailKind['emailType'],
): void {
  const error = new Error('Engagement email sent mark skipped because it was already set')
  Object.assign(error, {
    tags: { worker: 'engagement-email-processor', emailType, phase: 'mark-sent' },
    extra: { userId },
  })
  onError(error)
}
/* c8 ignore stop */
