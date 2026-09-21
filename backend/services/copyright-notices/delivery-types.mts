export type CopyrightDeliveryIntentRecord = {
  id: string
  copyright_notice_id: string
  copyright_notice_submission_id: string | null
  copyright_notice_correspondence_message_id: string | null
  recipient_user_id: string | null
  recipient_role: 'claimant' | 'poster' | 'correspondent'
  delivery_kind:
    | 'claimant_receipt'
    | 'status_update'
    | 'poster_restriction_notice'
    | 'counter_notice_forwarding'
  channel: 'in_app' | 'email'
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'
  ses_message_id: string | null
  delivery_attempt_count: number
}

export type CopyrightDeliveryRecipientRecord = {
  copyright_notice_delivery_intent_id: string
  email_ciphertext: string
}
