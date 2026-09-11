export type SesNotificationType = 'bounce' | 'complaint' | 'delivery'
export type SesBounceType = 'permanent' | 'transient' | 'undetermined'

export interface CreateSesBounceEventInput {
  notification_type: SesNotificationType
  bounce_type?: SesBounceType | null
  bounce_sub_type?: string | null
  recipients: string[]
  ses_message_id?: string | null
  ses_feedback_id?: string | null
  ses_timestamp?: Date | null
  raw_message: unknown
  diagnostic_code?: string | null
  reporting_mta?: string | null
}

export interface SesBounceEvent {
  id: string
  created_at: Date
  notification_type: SesNotificationType
  bounce_type: SesBounceType | null
  bounce_sub_type: string | null
  recipients: string[]
  ses_message_id: string | null
  ses_feedback_id: string | null
  ses_timestamp: Date | null
  raw_message: unknown
  diagnostic_code: string | null
  reporting_mta: string | null
  dedup_key: string | null
}
