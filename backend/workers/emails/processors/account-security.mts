import type { EmailTemplateInput } from '@queues/emails/types'
import { sendClassifiedEmail } from '@services/email-classification'
import { getDirectEmailAddress } from './recipient.mts'

export async function processSendAccountSecurityEmail(input: EmailTemplateInput): Promise<unknown> {
  return sendClassifiedEmail('processSendAccountSecurityEmail', {
    to: getDirectEmailAddress(input),
    subject: 'Your Voucha sign-in settings changed',
    text: 'Your email address or sign-in methods changed. Your other sessions have been signed out. If you did not make this change, contact Voucha support.',
  })
}
