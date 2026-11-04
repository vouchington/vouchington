import assert from 'http-assert'
import {
  copyrightTargetDeliveryKinds,
  type CopyrightDeliveryIntentInput,
  type CopyrightDeliveryIntentRecord,
} from './delivery-types.mts'

export type KeyedIntent = CopyrightDeliveryIntentRecord & {
  idempotency_key: string
  copyright_notice_target_id: string | null
}

export function assertDeliveryIntentInput(input: CopyrightDeliveryIntentInput): void {
  assert(
    Boolean(input.targetId) ===
      (copyrightTargetDeliveryKinds as readonly string[]).includes(input.deliveryKind),
    422,
    'Restriction notices carry their target and no other delivery does',
  )
  assert(
    !['poster', 'informed_owner'].includes(input.recipientRole) || input.recipientUserId,
    422,
    'Poster delivery requires a user recipient',
  )
  assert(
    input.recipientRole !== 'correspondent' || (!input.recipientUserId && input.recipientEmail),
    422,
    'Correspondent delivery requires an external email recipient',
  )
  assert(
    (input.recipientRole === 'informed_owner') === Boolean(input.targetPath),
    422,
    'Informed owner delivery requires a community path',
  )
}

export function assertReplayMatches(
  existing: KeyedIntent,
  input: CopyrightDeliveryIntentInput,
): void {
  assert(
    existing.copyright_notice_id === input.noticeId &&
      existing.copyright_notice_target_id === (input.targetId ?? null) &&
      existing.copyright_notice_submission_id === input.submissionId &&
      existing.copyright_notice_correspondence_message_id === input.correspondenceId &&
      existing.recipient_user_id === input.recipientUserId &&
      existing.recipient_role === input.recipientRole &&
      existing.delivery_kind === input.deliveryKind &&
      existing.target_path === (input.targetPath ?? null) &&
      existing.channel === input.channel,
    409,
    'Copyright delivery idempotency key was reused',
  )
}
