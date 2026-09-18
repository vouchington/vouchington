import type { ApiFixtureCase } from './types.mts'
import { predecessorIssue } from './predecessor-issue.mts'

export const adminId = '00000000-0000-7000-8000-000000000001'
export const contactId = '00000000-0000-7000-8000-000000000711'
export const threadId = '00000000-0000-7000-8000-000000000712'
export const messageId = '00000000-0000-7000-8000-000000000713'

export const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-admin',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [predecessorIssue(7879)],
}

export const pageInfo = {
  end_cursor: null,
  has_next_page: false,
  start_cursor: threadId,
}

export const contact = {
  created_at: '2026-07-01T12:00:00.000Z',
  email_address: 'traveler@example.test',
  id: contactId,
  name: 'Traveler Example',
  notes: 'Prefers email support.',
  updated_at: '2026-07-01T12:00:00.000Z',
  user_id: null,
}

export const thread = {
  assigned_at: null,
  assigned_to_id: null,
  contact_user_id: null,
  conversation_id: null,
  created_at: '2026-07-01T12:10:00.000Z',
  id: threadId,
  resolved_at: null,
  resolved_by_id: null,
  status: 'open',
  subject: 'Account access help',
  support_contact_id: contactId,
  updated_at: '2026-07-01T12:10:00.000Z',
}

export const message = {
  approved_at: null,
  approved_by_id: null,
  body_html: '<p>I cannot access my account.</p>',
  body_text: 'I cannot access my account.',
  created_at: '2026-07-01T12:11:00.000Z',
  created_by_id: null,
  direction: 'inbound',
  drafted_at: null,
  edited_at: null,
  edited_by_id: null,
  email_from: 'traveler@example.test',
  email_message_id: 'fixture-message@example.test',
  email_subject: 'Account access help',
  email_to: 'support@voucha.ai',
  id: messageId,
  sent_at: null,
  support_thread_id: threadId,
  updated_at: '2026-07-01T12:11:00.000Z',
}

export function threadRoute() {
  return { routeTemplate: '/api/v1/support/threads/:threadId', pathParams: { threadId } }
}

export function messageRoute() {
  return {
    routeTemplate: '/api/v1/support/threads/:threadId/messages/:messageId',
    pathParams: { messageId, threadId },
  }
}
