import type {
  EmailTemplateInput,
  ProcessSendEmailVerificationTokenVariables,
} from '@queues/emails/types'
import { renderEmailVerificationEmail } from '@email-templates/core'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export const processSendEmailVerificationToken = async (
  input: EmailTemplateInput,
  variables: ProcessSendEmailVerificationTokenVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  const { subject, html, text } = await renderEmailVerificationEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendEmailVerificationToken', {
    to: emailAddress,
    subject,
    html,
    text,
  })
}
