import type { ManifestEndpoint } from './endpoint-registry'

const contactId = '00000000-0000-7000-8000-000000000584'

export const crmEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.crm.contacts.default': {
    method: 'GET',
    path: '/api/v1/crm/contacts',
    query: { limit: '25', q: 'alice', status: 'new', vertical: 'credit_cards' },
  },
  'native.crm.contact-detail.default': {
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}`,
  },
  'native.crm.contact-create.default': {
    method: 'POST',
    path: '/api/v1/crm/contacts',
    requestBody: {
      contact_type: 'influencer',
      email: 'alice@example.test',
      follower_count: 250_000,
      name: 'Alice Creator',
      notes: 'Creator outreach contact',
      vertical: 'credit_cards',
    },
  },
  'native.crm.contact-update.default': {
    method: 'PATCH',
    path: `/api/v1/crm/contacts/${contactId}`,
    requestBody: {
      email: 'alice@example.test',
      follower_count: 255_000,
      name: 'Alice Creator',
      notes: 'Updated outreach notes',
      phone: '+1-415-555-0100',
      vertical: 'credit_cards',
    },
  },
  'native.crm.contact-archive.default': {
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}`,
  },
  'native.crm.contact-emails.default': {
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}/emails`,
    query: { limit: '25' },
  },
  'native.crm.contact-email-send.default': {
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/emails`,
    requestBody: {
      ai_generated_at: '2026-07-01T12:29:30Z',
      ai_prompt: 'Write a warm intro',
      body_text: 'Hi Alice, great to connect.',
      email_provider: 'ses',
      subject: 'Warm intro',
    },
  },
  'native.crm.contact-notes.default': {
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}/notes`,
    query: { limit: '25' },
  },
  'native.crm.contact-note-create.default': {
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/notes`,
    requestBody: { body: 'Met at the conference' },
  },
  'native.crm.contact-note-delete.default': {
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}/notes/00000000-0000-7000-8000-000000000901`,
  },
  'native.crm.contact-link-user.default': {
    method: 'PUT',
    path: `/api/v1/crm/contacts/${contactId}/user-link`,
    requestBody: { user_id: '00000000-0000-7000-8000-000000000001' },
  },
  'native.crm.contact-unlink-user.default': {
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}/user-link`,
  },
  'native.crm.contact-email-draft.default': {
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/email-drafts`,
    requestBody: { prompt: 'Focus on travel content', tone: 'friendly' },
  },
}
