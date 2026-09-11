import type {
  EmailTemplateInput,
  ProcessSendPostReferralLinkEmailVariables,
} from '@queues/emails/types'
import { renderPostReferralLinkEmail } from '@email-templates/core'
import onError from '@modules/on-error'
import { getMarketingPostalAddress } from '@modules/utils'
import { sendClassifiedEmail } from '@services/email-classification'
import { createEmailUnsubscribeUrl } from '@services/users'
import {
  hasEngagementEmailSent,
  isEngagementEmailsEnabled,
  isPostReferralLinkEmailStillEligible,
  markEngagementEmailDeliveryAttempted,
  markEngagementEmailSent,
  releaseUnsentEngagementEmailClaim,
} from '@services/users/engagement-emails'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendPostReferralLinkEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendPostReferralLinkEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') {
    await releaseUnsentEngagementEmailClaim(recipient.userId, 'post_referral_link')
    return recipient
  }
  const emailAddress = recipient.emailAddress
  if (input.userId) {
    if (!(await isEngagementEmailsEnabled(input.userId))) return null
    if (await hasEngagementEmailSent(input.userId, 'post_referral_link')) return null
    if (!(await isPostReferralLinkEmailStillEligible(input.userId))) return null
  }
  const { subject, html, text } = await renderPostReferralLinkEmail({
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
    if (!(await markEngagementEmailDeliveryAttempted(input.userId, 'post_referral_link'))) {
      /* c8 ignore next -- Defensive observability for concurrent processor races. */
      reportEngagementMarkSkipped(input.userId, 'post_referral_link')
      return null
    }
  }
  const result = await sendClassifiedEmail('processSendPostReferralLinkEmail', {
    to: emailAddress,
    subject,
    html,
    text,
    userId: input.userId,
  })
  if (input.userId) {
    try {
      if (!(await markEngagementEmailSent(input.userId, 'post_referral_link'))) {
        /* c8 ignore next -- Defensive observability for concurrent processor races. */
        reportEngagementMarkSkipped(input.userId, 'post_referral_link')
      }
    } catch (error) {
      /* c8 ignore next -- Avoid retrying after SES accepted the message. */
      reportEngagementMarkFailed(error, input.userId, 'post_referral_link')
    }
  }
  return result
}

/* c8 ignore start -- Defensive observability for post-send mark failures and races. */
function reportEngagementMarkFailed(error: unknown, userId: string, emailType: string): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'engagement-email-processor', emailType, phase: 'mark-sent' },
    extra: { userId },
  })
  onError(reportableError)
}

function reportEngagementMarkSkipped(userId: string, emailType: string): void {
  const error = new Error('Engagement email sent mark skipped because it was already set')
  Object.assign(error, {
    tags: { worker: 'engagement-email-processor', emailType, phase: 'mark-sent' },
    extra: { userId },
  })
  onError(error)
}
/* c8 ignore stop */
