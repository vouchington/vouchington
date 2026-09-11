import type { EmailTemplateInput, ProcessSendWelcomeEmailVariables } from '@queues/emails/types'
import { renderWelcomeEmail } from '@email-templates/core'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendWelcomeEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendWelcomeEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  const { subject, html, text } = await renderWelcomeEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendWelcomeEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  }).catch(wrapHttpForRetry)
}
