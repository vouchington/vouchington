import type { ApiFixtureCase } from './types.mts'
import {
  contact,
  contactId,
  pageInfo,
  shared,
  thread,
} from './native-staff-support-fixture-data.mts'

const contactRoute = {
  routeTemplate: '/api/v1/support/contacts/:contactId',
  pathParams: { contactId },
}

export const nativeStaffSupportContactApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.staff-support.contacts.default',
    method: 'GET',
    path: '/api/v1/support/contacts',
    query: { limit: '25', q: 'traveler' },
    route: { routeTemplate: '/api/v1/support/contacts' },
    status: 200,
    body: { page_info: { ...pageInfo, start_cursor: contactId }, results: [contact] },
  },
  {
    ...shared,
    id: 'native.staff-support.contact-detail.default',
    method: 'GET',
    path: `/api/v1/support/contacts/${contactId}`,
    query: { limit: '25' },
    route: contactRoute,
    status: 200,
    body: { contact, thread_page_info: pageInfo, threads: [thread] },
  },
  {
    ...shared,
    id: 'native.staff-support.contact-update.default',
    method: 'PATCH',
    path: `/api/v1/support/contacts/${contactId}`,
    requestBody: { name: 'Traveler Support', notes: 'Updated support notes.' },
    route: contactRoute,
    status: 200,
    body: {
      contact: {
        ...contact,
        name: 'Traveler Support',
        notes: 'Updated support notes.',
        updated_at: '2026-07-01T12:30:00.000Z',
      },
    },
  },
]
