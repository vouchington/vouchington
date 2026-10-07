export type SesNotificationType = 'bounce' | 'complaint' | 'delivery'
export type SesBounceType = 'permanent' | 'transient' | 'undetermined'

export interface CreateSesBounceEventInput {
  notification_type: SesNotificationType
  bounce_type?: SesBounceType | null
  amazon_ses_bounce_subtype_id?: string | null
  recipients: string[]
  amazon_ses_message_id?: string | null
  amazon_ses_feedback_id?: string | null
  occurred_at?: Date | null
  raw_message: unknown
  diagnostic_code?: string | null
  reporting_mta?: string | null
}

export interface SesBounceEvent {
  id: string
  created_at: Date
  notification_type: SesNotificationType
  bounce_type: SesBounceType | null
  amazon_ses_bounce_subtype_id: string | null
  recipients: string[]
  amazon_ses_message_id: string | null
  amazon_ses_feedback_id: string | null
  occurred_at: Date | null
  raw_message: unknown
  diagnostic_code: string | null
  reporting_mta: string | null
  dedup_key: string | null
}
