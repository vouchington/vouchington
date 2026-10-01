import { sendClassifiedEmail } from '@services/email-classification'
import {
  CopyrightDeliveryNotClaimedError,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentEmailSent,
  markCopyrightDeliveryIntentSent,
  prepareCopyrightEmailDelivery,
} from '@services/copyright-notices'

export async function processSendCopyrightNoticeEmail(data: {
  intentId: string
}): Promise<boolean> {
  let prepared: Awaited<ReturnType<typeof prepareCopyrightEmailDelivery>> | undefined
  try {
    prepared = await prepareCopyrightEmailDelivery(data.intentId)
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
    const { leaseToken, correspondenceId } = prepared
    const sesMessageId = result.MessageId
    // A reply to a declined email intake has no case correspondence to mark sent.
    return correspondenceId
      ? await markCopyrightDeliveryIntentEmailSent({
          intentId: data.intentId,
          leaseToken,
          correspondenceId,
          sesMessageId,
        })
      : await markCopyrightDeliveryIntentSent({ intentId: data.intentId, leaseToken, sesMessageId })
  } catch (error) {
    if (error instanceof CopyrightDeliveryNotClaimedError) return false
    if (prepared)
      await markCopyrightDeliveryIntentFailed({
        intentId: data.intentId,
        leaseToken: prepared.leaseToken,
        error: error instanceof Error ? error.message : String(error),
      })
    throw error
  }
}
