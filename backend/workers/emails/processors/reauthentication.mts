import type {
  EmailTemplateInput,
  ProcessSendReauthenticationTokenVariables,
} from '@queues/emails/types'
import { renderReauthenticationEmail } from '@email-templates/core'
import { assertValidLoginToken } from '@services/users/login-token'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export const processSendReauthenticationToken = async (
  input: EmailTemplateInput,
  variables: ProcessSendReauthenticationTokenVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  assertValidLoginToken(variables.token)
  const { subject, html, text } = await renderReauthenticationEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendReauthenticationToken', {
    to: emailAddress,
    subject,
    html,
    text,
  })
}
