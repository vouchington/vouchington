import type { MessageDirection } from '../common.mts'

export type SupportMessageDirection = MessageDirection

export type SupportMessage = {
  id: string
  support_thread_id: string
  direction: SupportMessageDirection
  body_text: string
  body_html: string
  created_at: Date
  created_by_id: string | null
  updated_at: Date
  email_message_id: string | null
  email_subject: string | null
  email_from: string | null
  email_to: string | null
  drafted_at: Date | null
  edited_at: Date | null
  edited_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
}
