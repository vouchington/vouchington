import type {
  EmailTemplateInput,
  ProcessSendCommunityOwnershipTransferEmailVariables,
} from '@queues/emails/types'
import { renderCommunityOwnershipTransferEmail } from '@email-templates/core'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { sendClassifiedEmail } from '@services/email-classification'
import { resolveEmailRecipient } from './recipient.mts'

export const processSendCommunityOwnershipTransferEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCommunityOwnershipTransferEmailVariables,
): Promise<unknown> => {
  const recipient = await resolveEmailRecipient(input)
  if (recipient.status === 'skipped') return recipient
  const { subject, html, text } = await renderCommunityOwnershipTransferEmail({
    ...variables,
    uiLocale: input.uiLocale ?? variables.uiLocale,
  })
  return sendClassifiedEmail('processSendCommunityOwnershipTransferEmail', {
    to: recipient.emailAddress,
    subject,
    html,
    text,
  }).catch(wrapHttpForRetry)
}
