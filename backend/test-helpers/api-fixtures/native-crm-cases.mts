import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const contactId = '00000000-0000-7000-8000-000000000584'
const noteId = '00000000-0000-7000-8000-000000000901'
const userId = '00000000-0000-7000-8000-000000000001'
const migratedFrom = ['https://github.com/jonathanong/filaments/issues/6584']

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-admin',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom,
}

export const nativeCrmApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.crm.contacts.default',
    method: 'GET',
    path: '/api/v1/crm/contacts',
    route: { routeTemplate: '/api/v1/crm/contacts' },
    query: { limit: '25', q: 'alice', status: 'new', vertical: 'credit_cards' },
    status: 200,
    body: responseBody('native.crm.contacts.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-detail.default',
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId',
      pathParams: { contactId },
    },
    status: 200,
    body: responseBody('native.crm.contact-detail.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-create.default',
    method: 'POST',
    path: '/api/v1/crm/contacts',
    route: { routeTemplate: '/api/v1/crm/contacts' },
    requestBody: {
      contact_type: 'influencer',
      email: 'alice@example.test',
      follower_count: 250_000,
      name: 'Alice Creator',
      notes: 'Creator outreach contact',
      vertical: 'credit_cards',
    },
    status: 201,
    body: responseBody('native.crm.contact-create.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-update.default',
    method: 'PATCH',
    path: `/api/v1/crm/contacts/${contactId}`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId',
      pathParams: { contactId },
    },
    requestBody: {
      email: 'alice@example.test',
      follower_count: 255_000,
      name: 'Alice Creator',
      notes: 'Updated outreach notes',
      phone: '+1-415-555-0100',
      vertical: 'credit_cards',
    },
    status: 200,
    body: responseBody('native.crm.contact-update.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-archive.default',
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId',
      pathParams: { contactId },
    },
    status: 204,
    body: null,
  },
  {
    ...shared,
    id: 'native.crm.contact-emails.default',
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}/emails`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/emails',
      pathParams: { contactId },
    },
    query: { limit: '25' },
    status: 200,
    body: responseBody('native.crm.contact-emails.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-email-send.default',
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/emails`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/emails',
      pathParams: { contactId },
    },
    requestBody: {
      ai_generated_at: '2026-07-01T12:29:30Z',
      ai_prompt: 'Write a warm intro',
      body_text: 'Hi Alice, great to connect.',
      email_provider: 'ses',
      subject: 'Warm intro',
    },
    status: 201,
    body: responseBody('native.crm.contact-email-send.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-notes.default',
    method: 'GET',
    path: `/api/v1/crm/contacts/${contactId}/notes`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/notes',
      pathParams: { contactId },
    },
    query: { limit: '25' },
    status: 200,
    body: responseBody('native.crm.contact-notes.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-note-create.default',
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/notes`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/notes',
      pathParams: { contactId },
    },
    requestBody: { body: 'Met at the conference' },
    status: 201,
    body: responseBody('native.crm.contact-note-create.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-note-delete.default',
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}/notes/${noteId}`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/notes/:noteId',
      pathParams: { contactId, noteId },
    },
    status: 204,
    body: null,
  },
  {
    ...shared,
    id: 'native.crm.contact-link-user.default',
    method: 'PUT',
    path: `/api/v1/crm/contacts/${contactId}/user-link`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/user-link',
      pathParams: { contactId },
    },
    requestBody: { user_id: userId },
    status: 200,
    body: responseBody('native.crm.contact-link-user.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-unlink-user.default',
    method: 'DELETE',
    path: `/api/v1/crm/contacts/${contactId}/user-link`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/user-link',
      pathParams: { contactId },
    },
    status: 200,
    body: responseBody('native.crm.contact-unlink-user.default'),
  },
  {
    ...shared,
    id: 'native.crm.contact-email-draft.default',
    method: 'POST',
    path: `/api/v1/crm/contacts/${contactId}/email-drafts`,
    route: {
      routeTemplate: '/api/v1/crm/contacts/:contactId/email-drafts',
      pathParams: { contactId },
    },
    requestBody: { prompt: 'Focus on travel content', tone: 'friendly' },
    status: 200,
    body: responseBody('native.crm.contact-email-draft.default'),
  },
]
