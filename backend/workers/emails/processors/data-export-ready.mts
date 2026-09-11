import type {
  EmailTemplateInput,
  ProcessSendDataExportReadyEmailVariables,
} from '@queues/emails/types'
import { renderDataExportReadyEmail } from '@email-templates/core'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendDataExportReadyEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendDataExportReadyEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  const { subject, html, text } = await renderDataExportReadyEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendDataExportReadyEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  })
}
