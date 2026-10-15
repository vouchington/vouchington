import type { ApiFixtureCase } from './types.mts'

const intakeId = '00000000-0000-7000-8000-000000000840'
const rejection = {
  rationale: 'The message is not a copyright notice.',
  recommendation_id: null,
  manual_fallback_reason: 'No agent output.',
}
const informationRequest = {
  ...rejection,
  rationale: 'The notice does not identify the allegedly infringing URLs.',
  response_kind: 'needs_information',
  response_message: 'Please identify the copyrighted work and each allegedly infringing URL.',
}

function rejectionCase(
  id: string,
  requestBody: Record<string, unknown>,
  replyQueued: boolean,
): ApiFixtureCase {
  return {
    id,
    method: 'POST',
    path: `/api/v1/copyright-email-intakes/${intakeId}/rejections`,
    route: {
      routeTemplate: '/api/v1/copyright-email-intakes/:id/rejections',
      pathParams: { id: intakeId },
    },
    auth: 'fixture-admin',
    status: 200,
    requestBody,
    body: { reply_queued: replyQueued },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/moderator-routes.mts',
      'web/lib/api/client/copyright-email-intakes.ts',
    ],
  }
}

export const webCopyrightEmailIntakeApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.email-notice-association-target',
    method: 'GET',
    path: '/api/v1/copyright-notices/00000000-0000-7000-8000-000000000841/association-target',
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/association-target',
      pathParams: { id: '00000000-0000-7000-8000-000000000841' },
    },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_notice: {
        id: '00000000-0000-7000-8000-000000000841',
        jurisdiction: 'us_dmca',
        received_at: '2026-10-13T12:00:00.000Z',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/moderator-routes.mts',
      'web/lib/api/client/copyright-notice-association-target.ts',
    ],
  },
  {
    id: 'web.copyright.email-intake-notice-association',
    method: 'POST',
    path: `/api/v1/copyright-email-intakes/${intakeId}/notice-associations`,
    route: {
      routeTemplate: '/api/v1/copyright-email-intakes/:id/notice-associations',
      pathParams: { id: intakeId },
    },
    auth: 'fixture-admin',
    status: 201,
    requestBody: { copyright_notice_id: '00000000-0000-7000-8000-000000000841' },
    body: {
      copyright_notice: { id: '00000000-0000-7000-8000-000000000841' },
      copyright_email_intake: { id: intakeId },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/moderator-routes.mts',
      'web/lib/api/client/copyright-email-intakes.ts',
    ],
  },
  rejectionCase(
    'web.copyright.email-intake-rejection.reply-queued',
    { ...rejection, reply_email: 'reporter@example.test' },
    true,
  ),
  rejectionCase(
    'web.copyright.email-intake-rejection.no-reply',
    { ...rejection, reply_email: null },
    false,
  ),
  rejectionCase(
    'web.copyright.email-intake-information-request.reply-queued',
    { ...informationRequest, reply_email: 'reporter@example.test' },
    true,
  ),
  rejectionCase(
    'web.copyright.email-intake-information-request.no-reply',
    { ...informationRequest, reply_email: null },
    false,
  ),
]
