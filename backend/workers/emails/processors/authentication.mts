import type {
  EmailTemplateInput,
  ProcessSendEmailAddressLoginTokenVariables,
} from '@queues/emails/types'
import { renderLoginTokenEmail } from '@email-templates/core'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'
import { assertValidLoginToken } from '@services/users/login-token'

export const processSendEmailAddressLoginToken = async (
  input: EmailTemplateInput,
  variables: ProcessSendEmailAddressLoginTokenVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  assertValidLoginToken(variables.token)
  const { subject, html, text } = await renderLoginTokenEmail({
    ...variables,
    emailAddress,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendEmailAddressLoginToken', {
    to: emailAddress,
    subject,
    html,
    text,
  })
}
