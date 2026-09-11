import onError from '@modules/on-error'
import { assertValidSendEmailOptions, type SendEmailOptions } from '@modules/utils/email'
import { getGmailTransport } from './client.mts'

/* no-mistakes: integration=smtp */
export function sendGmailEmail(options: SendEmailOptions) {
  assertValidSendEmailOptions(options)

  const transport = getGmailTransport()
  const promise = transport.sendMail({
    from: process.env.GMAIL_SMTP_USER,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    headers: options.headers,
  })
  promise.catch(onError)
  return promise
}
