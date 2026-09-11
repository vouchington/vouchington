import type {
  EmailTemplateInput,
  ProcessSendCommunityModerationSummaryEmailVariables,
} from '@queues/emails/types'
import { renderCommunityModerationSummaryEmail } from '@email-templates/core'
import onError from '@modules/on-error'
import { getMarketingPostalAddress } from '@modules/utils'
import { sendClassifiedEmail } from '@services/email-classification'
import { createEmailUnsubscribeUrl } from '@services/users'
import {
  getCommunityModerationSummaryCommunities,
  getModerationActivityWindowStart,
  getModerationEmailCadence,
  getModerationEmailTimezone,
  hasModerationEmailSent,
  isModerationEmailsEnabled,
  formatLocalDate,
  markModerationEmailSent,
  releaseUnsentModerationEmailClaim,
} from '@services/communities/moderation-summary-emails'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendCommunityModerationSummaryEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): Promise<unknown> => {
  let renderVariables = variables
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') {
    if (input.trackingKey) {
      await releaseUnsentModerationEmailClaim(recipient.userId, input.trackingKey)
    }
    return recipient
  }
  const emailAddress = recipient.emailAddress
  if (input.userId) {
    if (!(await isModerationEmailsEnabled(input.userId))) return null
    if (input.trackingKey && (await hasModerationEmailSent(input.userId, input.trackingKey))) {
      return null
    }
    const windowEnd = input.windowEnd ? new Date(input.windowEnd) : new Date()
    const windowStart = input.windowStart
      ? new Date(input.windowStart)
      : getModerationActivityWindowStart(await getModerationEmailCadence(input.userId), windowEnd)
    const communities = await getCommunityModerationSummaryCommunities(
      input.userId,
      windowStart,
      windowEnd,
    )
    if (communities.length === 0) return null
    const timeZone = await getModerationEmailTimezone(input.userId)
    renderVariables = {
      ...variables,
      communities,
      generatedForDate: formatLocalDate(windowEnd, timeZone),
    }
  }
  const { subject, html, text } = await renderCommunityModerationSummaryEmail({
    ...renderVariables,
    unsubscribeUrl:
      renderVariables.unsubscribeUrl ??
      (input.userId ? createEmailUnsubscribeUrl(input.userId, 'community_digest') : ''),
    physicalAddress: renderVariables.physicalAddress ?? getMarketingPostalAddress(),
    uiLocale: input.uiLocale ?? renderVariables.uiLocale,
  })
  const result = await sendClassifiedEmail('processSendCommunityModerationSummaryEmail', {
    to: emailAddress,
    subject,
    html,
    text,
    userId: input.userId,
  })
  if (input.userId && input.trackingKey) {
    try {
      if (!(await markModerationEmailSent(input.userId, input.trackingKey))) {
        /* c8 ignore next -- Defensive observability for concurrent processor races. */
        reportModerationMarkSkipped(input.userId, input.trackingKey)
      }
    } catch (error) {
      /* c8 ignore next -- Avoid retrying after SES accepted the message. */
      reportModerationMarkFailed(error, input.userId, input.trackingKey)
    }
  }
  return result
}

/* c8 ignore start -- Defensive observability for post-send mark failures and races. */
function reportModerationMarkFailed(error: unknown, userId: string, trackingKey: string): void {
  const reportableError = error instanceof Error ? error : new Error(String(error))
  Object.assign(reportableError, {
    tags: { worker: 'moderation-summary-email-processor', phase: 'mark-sent' },
    extra: { userId, trackingKey },
  })
  onError(reportableError)
}

function reportModerationMarkSkipped(userId: string, trackingKey: string): void {
  const error = new Error('Moderation summary sent mark skipped because it was already set')
  Object.assign(error, {
    tags: { worker: 'moderation-summary-email-processor', phase: 'mark-sent' },
    extra: { userId, trackingKey },
  })
  onError(error)
}
/* c8 ignore stop */
