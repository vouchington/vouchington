import { decryptSecret } from '@modules/token-secrets'
import { getVerifiedEmailAddress } from '@services/contribution-gating'
import { createCopyrightNoticeNotification } from '@services/notifications'
import assert from 'http-assert'
import {
  claimCopyrightDeliveryIntent,
  getCopyrightDeliveryRecipient,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentSent,
  recordCopyrightDeliveryRecipient,
} from './delivery-intents.mts'
import { getCopyrightEmailCorrespondence } from './correspondence.mts'

export class CopyrightDeliveryNotClaimedError extends Error {
  constructor() {
    super('Copyright delivery intent is not available to send')
  }
}

export async function deliverCopyrightInAppNotification(intentId: string): Promise<boolean> {
  const intent = await claimCopyrightDeliveryIntent(intentId)
  if (!intent) return false
  try {
    assert(intent.channel === 'in_app', 422, 'Copyright delivery intent is not an in-app notice')
    assert(intent.recipient_user_id, 422, 'Copyright in-app delivery requires a member recipient')
    assert(
      intent.delivery_kind !== 'counter_notice_forwarding',
      422,
      'Counter-notices are not sent in-app to claimants',
    )
    await createCopyrightNoticeNotification({
      userId: intent.recipient_user_id,
      noticeId: intent.copyright_notice_id,
      eventKey: `copyright-delivery:${intent.id}`,
      deliveryKind: intent.delivery_kind,
    })
    return await markCopyrightDeliveryIntentSent({ intentId })
  } catch (error) {
    await markCopyrightDeliveryIntentFailed({ intentId, error: errorMessage(error) })
    throw error
  }
}

export async function prepareCopyrightEmailDelivery(intentId: string): Promise<{
  correspondenceId: string
  recipientEmail: string
  subject: string
  text: string
}> {
  const intent = await claimCopyrightDeliveryIntent(intentId)
  if (!intent) throw new CopyrightDeliveryNotClaimedError()
  try {
    assert(intent.channel === 'email', 422, 'Copyright delivery intent is not an email')
    assert(
      intent.copyright_notice_correspondence_message_id,
      422,
      'Copyright legal email requires immutable correspondence',
    )
    const [correspondence, recipientEmail] = await Promise.all([
      getCopyrightEmailCorrespondence(intent.id),
      resolveCopyrightEmailRecipient(intent.id, intent.recipient_user_id, intent.recipient_role),
    ])
    await recordCopyrightDeliveryRecipient({ intentId: intent.id, recipientEmail })
    return {
      correspondenceId: intent.copyright_notice_correspondence_message_id,
      recipientEmail,
      subject: copyrightEmailSubject(intent.delivery_kind),
      text: correspondence.bodyText,
    }
  } catch (error) {
    await markCopyrightDeliveryIntentFailed({ intentId, error: errorMessage(error) })
    throw error
  }
}

export async function resolveCopyrightEmailRecipient(
  intentId: string,
  recipientUserId: string | null,
  recipientRole: 'claimant' | 'poster' | 'correspondent',
): Promise<string> {
  const retainedRecipient = await getCopyrightDeliveryRecipient(intentId)
  if (retainedRecipient)
    return decryptSecret(
      retainedRecipient.email_ciphertext,
      `copyright-delivery-recipient:${retainedRecipient.copyright_notice_delivery_intent_id}`,
    )
  if (recipientRole === 'poster') {
    assert(recipientUserId, 422, 'Copyright poster delivery requires a member recipient')
    const email = await getVerifiedEmailAddress(recipientUserId)
    assert(email, 422, 'Affected poster has no verified email address')
    return email
  }
  assert(false, 422, 'Copyright email delivery has no private recipient')
}

function copyrightEmailSubject(
  kind:
    | 'claimant_receipt'
    | 'status_update'
    | 'poster_restriction_notice'
    | 'counter_notice_forwarding',
): string {
  switch (kind) {
    case 'claimant_receipt':
      return 'We received your copyright notice'
    case 'poster_restriction_notice':
      return 'Copyright notice affecting your material'
    case 'counter_notice_forwarding':
      return 'Counter-notice for your copyright claim'
    case 'status_update':
      return 'Update to your copyright case'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
