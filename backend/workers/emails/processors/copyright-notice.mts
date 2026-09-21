import { sendClassifiedEmail } from '@services/email-classification'
import {
  CopyrightEmailIntakeResponseNotClaimedError,
  CopyrightDeliveryNotClaimedError,
  markCopyrightEmailIntakeResponseFailed,
  markCopyrightEmailIntakeResponseSent,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentEmailSent,
  prepareCopyrightEmailIntakeResponseDelivery,
  prepareCopyrightEmailDelivery,
} from '@services/copyright-notices'

export async function processSendCopyrightNoticeEmail(data: {
  intentId?: string
  intakeResponseId?: string
}): Promise<boolean> {
  try {
    const prepared = await prepareCopyrightEmail(data)
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
    return markCopyrightEmailSent(data, prepared, result.MessageId)
  } catch (error) {
    if (
      error instanceof CopyrightDeliveryNotClaimedError ||
      error instanceof CopyrightEmailIntakeResponseNotClaimedError
    )
      return false
    await markCopyrightEmailFailed(data, error)
    throw error
  }
}

async function prepareCopyrightEmail(data: { intentId?: string; intakeResponseId?: string }) {
  if (data.intentId && !data.intakeResponseId) return prepareCopyrightEmailDelivery(data.intentId)
  if (data.intakeResponseId && !data.intentId) {
    const response = await prepareCopyrightEmailIntakeResponseDelivery(data.intakeResponseId)
    return { ...response, correspondenceId: null }
  }
  throw new Error('Copyright email job must identify exactly one delivery')
}

async function markCopyrightEmailSent(
  data: { intentId?: string; intakeResponseId?: string },
  prepared: Awaited<ReturnType<typeof prepareCopyrightEmail>>,
  sesMessageId: string,
): Promise<boolean> {
  if (data.intentId && prepared.correspondenceId)
    return markCopyrightDeliveryIntentEmailSent({
      intentId: data.intentId,
      correspondenceId: prepared.correspondenceId,
      sesMessageId,
    })
  return markCopyrightEmailIntakeResponseSent({
    responseId: data.intakeResponseId!,
    sesMessageId,
  })
}

async function markCopyrightEmailFailed(
  data: { intentId?: string; intakeResponseId?: string },
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  if (data.intentId && !data.intakeResponseId) {
    await markCopyrightDeliveryIntentFailed({ intentId: data.intentId, error: message })
    return
  }
  if (data.intakeResponseId && !data.intentId) {
    await markCopyrightEmailIntakeResponseFailed({
      responseId: data.intakeResponseId,
      error: message,
    })
  }
}
