import type {
  EmailTemplateInput,
  ProcessSendCommunityInviteEmailVariables,
} from '@queues/emails/types'
import { renderCommunityInviteEmail } from '@email-templates/core'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export const processSendCommunityInviteEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCommunityInviteEmailVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  const { subject, html, text } = await renderCommunityInviteEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendCommunityInviteEmail', {
    to: emailAddress,
    subject,
    html,
    text,
  }).catch(wrapHttpForRetry)
}
