import { decryptSecret } from '@modules/token-secrets'
import { getVerifiedEmailAddress } from '@services/contribution-gating'
import { createCopyrightNoticeNotification } from '@services/notifications'
import assert from 'http-assert'
import {
  type ClaimedCopyrightDeliveryIntent,
  claimCopyrightDeliveryIntent,
  getCopyrightDeliveryRecipient,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentSent,
  recordCopyrightDeliveryRecipient,
} from './delivery-intents.mts'
import { getCopyrightEmailCorrespondence } from './correspondence.mts'
import type { CopyrightDeliveryKind } from './delivery-types.mts'
import { decryptCopyrightEmailIntakeResponseBody } from './email-intake-reply.mts'

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
    assert(intent.copyright_notice_id, 422, 'Copyright in-app delivery requires a case')
    assert(
      intent.delivery_kind === 'claimant_receipt' ||
        intent.delivery_kind === 'status_update' ||
        intent.delivery_kind === 'poster_restriction_notice',
      422,
      'Copyright delivery kind is not sent in-app',
    )
    await createCopyrightNoticeNotification({
      userId: intent.recipient_user_id,
      noticeId: intent.copyright_notice_id,
      eventKey: `copyright-delivery:${intent.id}`,
      deliveryKind: intent.delivery_kind,
    })
    return await markCopyrightDeliveryIntentSent({ intentId, leaseToken: intent.lease_token })
  } catch (error) {
    await markCopyrightDeliveryIntentFailed({
      intentId,
      leaseToken: intent.lease_token,
      error: errorMessage(error),
    })
    throw error
  }
}

/** `correspondenceId` is null for a reply to a declined email intake, which has no case correspondence. */
export async function prepareCopyrightEmailDelivery(intentId: string): Promise<{
  leaseToken: string
  correspondenceId: string | null
  recipientEmail: string
  subject: string
  text: string
}> {
  const intent = await claimCopyrightDeliveryIntent(intentId)
  if (!intent) throw new CopyrightDeliveryNotClaimedError()
  try {
    assert(intent.channel === 'email', 422, 'Copyright delivery intent is not an email')
    const [text, recipientEmail] = await Promise.all([
      loadCopyrightEmailText(intent),
      resolveCopyrightEmailRecipient(intent.id, intent.recipient_user_id, intent.recipient_role),
    ])
    await recordCopyrightDeliveryRecipient({ intentId: intent.id, recipientEmail })
    return {
      leaseToken: intent.lease_token,
      correspondenceId: intent.copyright_notice_correspondence_message_id,
      recipientEmail,
      subject: copyrightEmailSubject(intent.delivery_kind),
      text,
    }
  } catch (error) {
    await markCopyrightDeliveryIntentFailed({
      intentId,
      leaseToken: intent.lease_token,
      error: errorMessage(error),
    })
    throw error
  }
}

async function loadCopyrightEmailText(intent: ClaimedCopyrightDeliveryIntent): Promise<string> {
  if (intent.copyright_notice_email_intake_id) {
    assert(intent.body_ciphertext, 422, 'Copyright email intake reply has no stored body')
    return decryptCopyrightEmailIntakeResponseBody(intent.id, intent.body_ciphertext)
  }
  assert(
    intent.copyright_notice_correspondence_message_id,
    422,
    'Copyright legal email requires immutable correspondence',
  )
  return (await getCopyrightEmailCorrespondence(intent.id)).bodyText
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

function copyrightEmailSubject(kind: CopyrightDeliveryKind): string {
  switch (kind) {
    case 'email_intake_rejected':
      return 'We could not accept your copyright notice'
    case 'email_intake_needs_information':
      return 'More information is needed for your copyright notice'
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
