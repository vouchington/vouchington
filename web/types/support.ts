export interface SupportContact {
  id: string
  email_address: string
  name: string
  user_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface SupportThread {
  id: string
  support_contact_id: string
  contact_user_id?: string | null
  subject: string
  conversation_id: string | null
  created_at: string
  updated_at: string
  assigned_at: string | null
  assigned_to_id: string | null
  resolved_at: string | null
  resolved_by_id: string | null
  status: 'open' | 'assigned' | 'resolved'
}

export type SupportMessageDirection = 'inbound' | 'outbound'

export interface SupportMessage {
  id: string
  support_thread_id: string
  direction: SupportMessageDirection
  body_text: string
  body_html: string
  created_at: string
  created_by_id: string | null
  updated_at: string
  email_message_id: string | null
  email_subject: string | null
  email_from: string | null
  email_to: string | null
  drafted_at: string | null
  edited_at: string | null
  edited_by_id: string | null
  approved_at: string | null
  approved_by_id: string | null
  sent_at: string | null
}

export interface SupportThreadsResponse {
  results: SupportThread[]
  page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
}

export interface SupportMessagesResponse {
  results: SupportMessage[]
  page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
}

export interface SupportContactsResponse {
  results: SupportContact[]
  page_info: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
}

export interface SupportContactDetailResponse {
  contact: SupportContact
  threads: SupportThread[]
  thread_page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export interface SupportThreadCreateResponseBody {
  message: SupportMessage | null
  thread: SupportThread
}
