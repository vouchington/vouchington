import type { ApiFixtureCase } from './types.mts'

const intakeId = '00000000-0000-7000-8000-000000000840'
const rejection = {
  rationale: 'The message is not a copyright notice.',
  recommendation_id: null,
  manual_fallback_reason: 'No agent output.',
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
]
