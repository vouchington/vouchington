import type { SupportMessage, SupportMessagesResponse, SupportThread } from '@/types/support'

export function makeThread(overrides: Partial<SupportThread> = {}): SupportThread {
  return {
    id: 'thread-1',
    support_contact_id: 'contact-1',
    contact_user_id: null,
    subject: 'Test subject',
    conversation_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    assigned_at: null,
    assigned_to_id: null,
    resolved_at: null,
    resolved_by_id: null,
    status: 'open',
    ...overrides,
  }
}

export function makeMessage(overrides: Partial<SupportMessage> = {}): SupportMessage {
  return {
    id: 'msg-1',
    support_thread_id: 'thread-1',
    direction: 'inbound',
    body_text: 'Hello world',
    body_html: '<p>Hello world</p>',
    created_at: '2024-01-01T00:00:00Z',
    created_by_id: null,
    updated_at: '2024-01-01T00:00:00Z',
    email_message_id: null,
    email_subject: null,
    email_from: null,
    email_to: null,
    drafted_at: null,
    edited_at: null,
    edited_by_id: null,
    approved_at: null,
    approved_by_id: null,
    sent_at: null,
    ...overrides,
  }
}

export function page(results: SupportMessage[]): SupportMessagesResponse {
  return { results, page_info: { has_next_page: false, end_cursor: null, start_cursor: null } }
}
