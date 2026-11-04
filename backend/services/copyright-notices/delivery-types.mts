import type { FiniteValue } from '@data-stores/psql/finite-values/index'

export type CopyrightEmailIntakeDeliveryKind = Extract<
  FiniteValue<'copyright_notice_delivery_kinds'>,
  'email_intake_received' | 'email_intake_rejected' | 'email_intake_needs_information'
>
export type CopyrightNoticeDeliveryKind = Exclude<
  FiniteValue<'copyright_notice_delivery_kinds'>,
  CopyrightEmailIntakeDeliveryKind
>
export type CopyrightDeliveryKind = FiniteValue<'copyright_notice_delivery_kinds'>

/** The kinds a restriction event sends per target; their rows carry the target they describe. */
export const copyrightTargetDeliveryKinds = [
  'poster_restriction_notice',
  'poster_review_notice',
  'poster_restoration_notice',
  'owner_information_notice',
] as const satisfies readonly CopyrightNoticeDeliveryKind[]

export const copyrightDecisionDeliveryKinds = [
  'poster_restriction_notice',
  'claimant_decision_notice',
] as const satisfies readonly CopyrightNoticeDeliveryKind[]

export type CopyrightDeliveryIntentRecord = {
  id: string
  lease_token: string | null
  copyright_notice_id: string | null
  copyright_notice_submission_id: string | null
  copyright_notice_correspondence_message_id: string | null
  recipient_user_id: string | null
  recipient_role: FiniteValue<'copyright_notice_delivery_intent_recipient_roles'>
  delivery_kind: CopyrightDeliveryKind
  target_path: string | null
  channel: FiniteValue<'copyright_notice_delivery_intent_channels'>
  state: FiniteValue<'copyright_notice_delivery_intent_states'>
  amazon_ses_message_id: string | null
  attempt_count: number
}

export type CopyrightDeliveryRecipientRecord = {
  copyright_notice_delivery_work_item_id: string
  email_ciphertext: string
}
