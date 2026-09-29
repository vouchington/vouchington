export type CopyrightStaffAlertCondition =
  | 'awaiting_review'
  | 'urgent_filing'
  | 'missed_deadline'
  | 'delivery_failed'
  | 'delivery_bounced'
  | 'reconciliation_needed'

export type CopyrightStaffAlert = {
  id: string
  copyright_notice_id: string
  condition: CopyrightStaffAlertCondition
  condition_opened_at: Date
  work_description: string
  claimant_contact_ciphertext: string
  failure_ciphertext: string | null
}

export type CopyrightStaffAlertAcknowledgement = {
  id: string
  copyright_staff_alert_id: string
  condition_opened_at: Date
  acknowledged_at: Date
  acknowledged_by_user_id: string | null
  acknowledged_by_user_erased_at: Date | null
}
