import type { ApiFixtureCase } from './types.mts'

const noticeId = '00000000-0000-7000-8000-000000000830'
const capabilityId = '00000000-0000-7000-8000-000000000831'
const submissionId = '00000000-0000-7000-8000-000000000832'
const correspondenceId = '00000000-0000-7000-8000-000000000833'
const issuerId = '00000000-0000-7000-8000-000000000834'

export const webCopyrightGuestApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.guest-capability.issued',
    method: 'POST',
    path: `/api/v1/copyright-notices/${noticeId}/guest-capabilities`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/guest-capabilities',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-admin',
    status: 201,
    requestBody: { expires_at: '2026-08-01T12:00:00.000Z' },
    body: {
      copyright_guest_capability: {
        id: capabilityId,
        expires_at: '2026-08-01T12:00:00.000Z',
        token: 'fixture-guest-capability-token',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/guest-capability-routes.mts',
      'web/lib/api/client/copyright-guest.ts',
    ],
  },
  {
    id: 'web.copyright.guest-capabilities.listed',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/guest-capabilities`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/guest-capabilities',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_guest_capabilities: [
        {
          id: capabilityId,
          issued_at: '2026-07-02T12:00:00.000Z',
          issued_by_id: issuerId,
          issued_by_username: 'fixture-copyright-staff',
          expires_at: '2026-08-01T12:00:00.000Z',
          revoked_at: null,
        },
      ],
      page_info: {
        has_next_page: false,
        start_cursor: 'fixture-guest-capabilities-start-cursor',
        end_cursor: 'fixture-guest-capabilities-end-cursor',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/guest-capability-list-route.mts',
      'web/lib/api/client/copyright-guest.ts',
    ],
  },
  {
    id: 'web.copyright.guest-capability.revoked',
    method: 'POST',
    path: `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/revocation`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
      pathParams: { id: noticeId, capabilityId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_guest_capability: {
        id: capabilityId,
        revoked_at: '2026-07-02T12:00:00.000Z',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/guest-capability-routes.mts',
      'web/lib/api/client/copyright-guest.ts',
    ],
  },
  {
    id: 'web.copyright.guest-information.requested',
    method: 'POST',
    path: `/api/v1/copyright-notices/${noticeId}/guest-capabilities/${capabilityId}/information-requests`,
    route: {
      routeTemplate:
        '/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
      pathParams: { id: noticeId, capabilityId },
    },
    auth: 'fixture-admin',
    status: 201,
    requestBody: { statement: 'Send the registration number.' },
    body: { copyright_correspondence: { id: correspondenceId } },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/guest-capability-routes.mts',
      'web/lib/api/client/copyright-guest.ts',
    ],
  },
  {
    id: 'web.copyright.guest-filing.received',
    method: 'POST',
    path: `/api/v1/copyright-notices/${noticeId}/guest-filings`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/guest-filings',
      pathParams: { id: noticeId },
    },
    auth: 'none',
    status: 201,
    requestBody: {
      kind: 'supplement',
      statement: 'Corrected work description.',
      cf_turnstile_response: 'fixture-turnstile-token',
    },
    body: {
      copyright_submission: {
        id: submissionId,
        kind: 'supplement',
        received_at: '2026-07-02T15:00:00.000Z',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/guest-capability-routes.mts',
      'web/lib/api/client/copyright-guest.ts',
    ],
  },
]
