import type { EmailTemplateInput, ProcessSendSupportEmailVariables } from '@queues/emails/types'
import { renderSupportReplyEmail } from '@email-templates/core'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export const processSendSupportEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendSupportEmailVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  const { subject, html, text } = await renderSupportReplyEmail({
    bodyText: variables.bodyText,
    subject: variables.subject,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendSupportEmail', {
    to: emailAddress,
    subject,
    html,
    text,
  })
}
