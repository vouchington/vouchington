import type { QueryOptions } from '@data-stores/psql'
import { createSupportMessage } from './create-support-message.mts'
import type { SupportMessage } from './types.mts'

export async function persistInboundSupportMessage(
  threadId: string,
  params: {
    bodyText: string
    emailMessageId?: string
    subject: string
    fromEmail: string
    toEmail: string
  },
  options: QueryOptions,
  beforePersist?: () => Promise<void>,
): Promise<SupportMessage> {
  await beforePersist?.()
  return await createSupportMessage(
    threadId,
    {
      direction: 'inbound',
      bodyText: params.bodyText,
      emailMessageId: params.emailMessageId,
      emailSubject: params.subject,
      emailFrom: params.fromEmail,
      emailTo: params.toEmail,
    },
    { ...options, skipEnqueue: true },
  )
}
