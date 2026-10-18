import type { ProcessSendCommunityModerationSummaryEmailVariables } from '@queues/background/enqueues/email-digests-domain'
import type { EmailTemplateInput } from '@queues/emails/types'
import { renderCommunityModerationSummaryEmail } from '@email-templates/core'
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
import { resolveEmailRecipient } from '@workers/emails/processors/recipient'

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
  // Claim the at-most-once send before SES. A crash or ambiguous SES response can lose this
  // summary, but retrying it could send a duplicate to the moderator.
  if (input.userId && input.trackingKey) {
    if (!(await markModerationEmailSent(input.userId, input.trackingKey))) return null
  }
  return sendClassifiedEmail('processSendCommunityModerationSummaryEmail', {
    to: emailAddress,
    subject,
    html,
    text,
    userId: input.userId,
  })
}
