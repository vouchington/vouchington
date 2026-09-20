import type { createInboundSupportEmailMessage } from '@services/customer-support'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import type { ParsedSesInboundEmail } from './mime.mts'

export async function persistSesInboundEmail(
  data: SesInboundProcessJobData,
  email: ParsedSesInboundEmail,
  createMessage: typeof createInboundSupportEmailMessage,
): Promise<void> {
  await createMessage({
    sesMessageId: data.sesMessageId,
    s3ObjectKey: data.objectKey,
    ...email,
    emailTo: process.env.SUPPORT_EMAIL_ADDRESS ?? 'support@voucha.ai',
  })
}
