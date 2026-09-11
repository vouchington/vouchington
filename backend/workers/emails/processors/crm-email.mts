import type { EmailTemplateInput, ProcessSendCrmEmailVariables } from '@queues/emails/types'
import { renderCrmOutreachEmail } from '@email-templates/core'
import { getMarketingPostalAddress } from '@modules/utils'
import { createCrmUnsubscribeUrl } from '@services/crm-contacts'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export const processSendCrmEmail = async (
  input: EmailTemplateInput,
  variables: ProcessSendCrmEmailVariables,
): Promise<unknown> => {
  const emailAddress = getDirectEmailAddress(input)
  const { subject, html, text } = await renderCrmOutreachEmail({
    contactName: variables.contactName,
    senderName: variables.senderName,
    bodyHtml: variables.bodyHtml,
    ctaUrl: variables.ctaUrl,
    ctaLabel: variables.ctaLabel,
    imageUrl: variables.imageUrl,
    uiLocale: input.uiLocale ?? variables.uiLocale,
    unsubscribeUrl: createCrmUnsubscribeUrl(emailAddress),
    physicalAddress: getMarketingPostalAddress(),
  })

  return sendClassifiedEmail('processSendCrmEmail', {
    to: emailAddress,
    subject,
    html,
    text,
    crmEmail: emailAddress,
    provider: variables.provider,
  })
}
