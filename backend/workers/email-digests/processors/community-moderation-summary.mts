import { recheckModerationSummaryCommunities } from '@services/communities/moderation-summary-eligibility'
import type { ProcessSendCommunityModerationSummaryEmailVariables } from '@queues/background/enqueues/email-digests-domain'
import type { EmailTemplateInput } from '@queues/emails/types'
import { renderCommunityModerationSummaryEmail } from '@email-templates/core'
import { getMarketingPostalAddress } from '@modules/utils'
import { isAwsThrottlingError } from '@vouchington/aws/errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { createEmailUnsubscribeUrl } from '@services/users'
import {
  markModerationEmailSent,
  resetRejectedModerationEmailSend,
  releaseUnsentModerationEmailClaim,
} from '@services/communities/moderation-summary-emails'
import { formatLocalDate } from '@services/communities/moderation-summary-schedule'
import {
  readModerationSummaryWindow,
  resolveModerationSummaryRecipient,
} from './moderation-summary-guard.mts'

/** The terminal job: rechecks the collected communities, renders and sends one summary. */
export async function processSendCommunityModerationSummaryEmail(
  input: EmailTemplateInput,
  variables: ProcessSendCommunityModerationSummaryEmailVariables,
): Promise<unknown> {
  const now = new Date()
  let renderVariables = variables
  const recipient = await resolveModerationSummaryRecipient(input)
  if ('skipped' in recipient) return recipient.skipped
  const emailAddress = recipient.emailAddress
  if (input.userId) {
    const window = await readModerationSummaryWindow(
      input.userId,
      input,
      variables.dispatchTimeZone,
      now,
    )
    if (!window) return null
    const { collection } = variables
    const communities = await recheckModerationSummaryCommunities(
      input.userId,
      variables.communities,
      window.queuedWindowEnd,
      collection.top,
    )
    if (communities.length === 0) {
      if (input.trackingKey)
        await releaseUnsentModerationEmailClaim(input.userId, input.trackingKey)
      return null
    }
    renderVariables = {
      ...variables,
      communities,
      remainingCommunityCount: Math.max(0, collection.eligibleCount - collection.top.length),
      generatedForDate: formatLocalDate(window.queuedWindowEnd, variables.dispatchTimeZone),
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
