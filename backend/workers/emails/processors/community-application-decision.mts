import type {
  EmailTemplateInput,
  ProcessSendCommunityApplicationDecisionEmailVariables,
} from '@queues/emails/types'
import { renderCommunityApplicationDecisionEmail } from '@email-templates/core'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendCommunityApplicationDecisionEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCommunityApplicationDecisionEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  const { subject, html, text } = await renderCommunityApplicationDecisionEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendCommunityApplicationDecisionEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  }).catch(wrapHttpForRetry)
}
