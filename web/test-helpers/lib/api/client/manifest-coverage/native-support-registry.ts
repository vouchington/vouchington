import type { ManifestEndpoint } from './endpoint-registry'

const threadId = '00000000-0000-7000-8000-000000000712'
const messageId = '00000000-0000-7000-8000-000000000713'
const contactId = '00000000-0000-7000-8000-000000000711'

export const nativeSupportEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.staff-support.threads.default': {
    method: 'GET',
    path: '/api/v1/support/threads',
    query: { limit: '25', q: 'account', status: 'open' },
  },
  'native.staff-support.thread-detail.default': {
    method: 'GET',
    path: `/api/v1/support/threads/${threadId}`,
  },
  'native.staff-support.thread-assign.default': {
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { assigned_to_id: '00000000-0000-7000-8000-000000000001' },
  },
  'native.staff-support.thread-resolve.default': {
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { resolved: true },
  },
  'native.staff-support.thread-reopen.default': {
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { resolved: false },
  },
  'native.staff-support.messages.default': {
    method: 'GET',
    path: `/api/v1/support/threads/${threadId}/messages`,
    query: { limit: '50' },
  },
  'native.staff-support.message-create.default': {
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages`,
    requestBody: { body_text: 'Saved outbound reply.' },
  },
  'native.staff-support.draft-create.default': {
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/drafts`,
  },
  'native.staff-support.message-edit.default': {
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}`,
    requestBody: { body_text: 'Edited support draft.' },
  },
  'native.staff-support.message-approve.default': {
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}/approvals`,
  },
  'native.staff-support.message-send.default': {
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}/sends`,
  },
  'native.staff-support.contacts.default': {
    method: 'GET',
    path: '/api/v1/support/contacts',
    query: { limit: '25', q: 'traveler' },
  },
  'native.staff-support.contact-detail.default': {
    method: 'GET',
    path: `/api/v1/support/contacts/${contactId}`,
    query: { limit: '25' },
  },
  'native.staff-support.contact-update.default': {
    method: 'PATCH',
    path: `/api/v1/support/contacts/${contactId}`,
    requestBody: { name: 'Traveler Support', notes: 'Updated support notes.' },
  },
}
