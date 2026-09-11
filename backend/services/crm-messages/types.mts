export type { CrmMessage } from '@voucha/types/entities/crm-contact'

export type CreateCrmMessageInput = {
  conversation_id: string
  contact_id: string
  direction: 'inbound' | 'outbound'
  from_email: string
  to_email: string
  subject?: string | null
  body_text?: string | null
  body_html?: string | null
  email_provider?: 'ses' | 'gmail_smtp' | null
  sent_by_id?: string | null
  ai_prompt?: string | null
  ai_generated_at?: Date | null
}

export type SendCrmEmailInput = {
  subject: string
  body_html?: string | null
  body_text?: string | null
  email_provider: 'ses' | 'gmail_smtp'
  cta_url?: string | null
  ai_prompt?: string | null
  ai_generated_at?: Date | null
}
