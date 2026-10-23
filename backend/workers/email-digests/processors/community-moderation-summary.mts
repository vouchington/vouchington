import type { ProcessSendCommunityModerationSummaryEmailVariables } from '@queues/background/enqueues/email-digests-domain'
import type { EmailTemplateInput } from '@queues/emails/types'
import { renderCommunityModerationSummaryEmail } from '@email-templates/core'
import { getMarketingPostalAddress } from '@modules/utils'
import { isAwsThrottlingError } from '@modules/queue-errors'
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
  resetRejectedModerationEmailSend,
  releaseUnsentModerationEmailClaim,
} from '@services/communities/moderation-summary-emails'
import { resolveEmailRecipient } from '@workers/emails/processors/recipient'
import { isModerationSummaryJobCurrent } from '@services/communities/moderation-summary-retention'

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
    const timeZone = await getModerationEmailTimezone(input.userId)
    if (
      input.trackingKey &&
      (!input.windowEnd ||
        !isModerationSummaryJobCurrent(input.trackingKey, input.windowEnd, timeZone, new Date()))
    )
      return null
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
  const { userId, trackingKey } = input
  try {
    return await sendClassifiedEmail('processSendCommunityModerationSummaryEmail', {
      to: emailAddress,
      subject,
      html,
      text,
      userId: input.userId,
      // Preference and suppression reads happen before this callback. Mark immediately before
      // SES. A lost mark acknowledgement may drop this summary: clearing an unconfirmed mark
      // could erase another worker's winning mark and allow a duplicate send.
      beforeDispatch:
        userId && trackingKey ? () => markModerationEmailSent(userId, trackingKey) : undefined,
    })
  } catch (err) {
    // SES sending-rate rejection is definitive: no mail was accepted. Unknown outcomes keep the
    // mark so a retry cannot duplicate a summary that may have been delivered.
    if (input.userId && input.trackingKey && isAwsThrottlingError(err)) {
      await resetRejectedModerationEmailSend(input.userId, input.trackingKey)
    }
    throw err
  }
}
