import { sendClassifiedEmail } from '@services/email-classification'
import {
  CopyrightDeliveryNotClaimedError,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentEmailSent,
  prepareCopyrightEmailDelivery,
} from '@services/copyright-notices'

export async function processSendCopyrightNoticeEmail(data: {
  intentId: string
}): Promise<boolean> {
  try {
    const prepared = await prepareCopyrightEmailDelivery(data.intentId)
    const result = (await sendClassifiedEmail('processSendCopyrightNoticeEmail', {
      to: prepared.recipientEmail,
      subject: prepared.subject,
      text: prepared.text,
      source: process.env.SES_COPYRIGHT_SOURCE_EMAIL || undefined,
      replyToAddress: process.env.SES_COPYRIGHT_REPLY_TO || undefined,
      allowGlobalBcc: false,
    })) as { MessageId?: unknown }
    if (typeof result.MessageId !== 'string' || result.MessageId.length === 0) {
      throw new Error('SES accepted copyright email without a MessageId')
    }
    return await markCopyrightDeliveryIntentEmailSent({
      intentId: data.intentId,
      correspondenceId: prepared.correspondenceId,
      sesMessageId: result.MessageId,
    })
  } catch (error) {
    if (error instanceof CopyrightDeliveryNotClaimedError) return false
    await markCopyrightDeliveryIntentFailed({
      intentId: data.intentId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
