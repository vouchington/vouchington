import type {
  EmailTemplateInput,
  ProcessSendCommunityRoleChangeEmailVariables,
} from '@queues/emails/types'
import { renderCommunityRoleChangeEmail } from '@email-templates/core'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendCommunityRoleChangeEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCommunityRoleChangeEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  const { subject, html, text } = await renderCommunityRoleChangeEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendCommunityRoleChangeEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  }).catch(wrapHttpForRetry)
}
