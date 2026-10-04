import { encodeScopedUuidCursor } from '@modules/pagination'
import type { ApiFixtureCase } from './types.mts'

const noticeId = '00000000-0000-7000-8000-000000001218'
const pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
const euParticipantId = '00000000-0000-7000-8000-00000000121d'
const euSettlementId = '00000000-0000-7000-8000-00000000121c'
const euSettlementStartCursor = encodeScopedUuidCursor(
  euSettlementId,
  `copyright-eu-settlements:${noticeId}:participant:${euParticipantId}`,
)

export const webCopyrightEuApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.eu.jurisdiction-availability',
    method: 'GET',
    path: '/api/v1/copyright-jurisdiction-availability',
    route: { routeTemplate: '/api/v1/copyright-jurisdiction-availability' },
    auth: 'none',
    status: 200,
    body: { copyright_jurisdiction_availability: { eu_dsa: false, uk: false } },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.eu.participant.no-action-complaint',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/participant`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/participant',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      copyright_notice: {
        id: noticeId,
        jurisdiction: 'eu_dsa',
        received_at: '2026-07-01T12:00:00.000Z',
        accepted_at: null,
        provisional_withholding_at: null,
        target_count: 0,
        claimant: null,
        targets: [],
        timeline: [],
        viewer_role: 'claimant',
        respondable_target_ids: [],
        submissions: [],
        statements: [
          {
            id: '00000000-0000-7000-8000-000000001219',
            delivery_kind: 'claimant_decision_notice',
            state: 'sent',
            sent_at: '2026-07-01T12:11:00.000Z',
            text: [
              `We decided not to restrict the material for copyright case ${noticeId}. You may seek judicial redress through a court.`,
              `This decision concerns copyright case ${noticeId}, received 2026-07-01T12:00:00.000Z, and was taken in response to a notice.`,
              'A person made this decision.',
              'Automated detection was not used.',
              'Automated tools did not assist with processing this case.',
              'Legal ground considered: claimed copyright infringement under EU or Member State law, on a notice under Article 16 of the Digital Services Act.',
              'Public explanation: The notice did not establish infringement for the identified hosted use.',
              `You may submit an internal complaint within 6 months after you are informed of this decision. Internal complaint: /copyright/notices/${noticeId}/complaint. You may refer this decision to a certified out-of-court dispute settlement body under Article 21 of the Digital Services Act. You may seek judicial redress through a court.`,
            ].join('\n\n'),
          },
          {
            id: '00000000-0000-7000-8000-00000000121a',
            delivery_kind: 'redress_decision_notice',
            state: 'sent',
            sent_at: '2026-07-01T12:31:00.000Z',
            text: [
              `Decision on your complaint in copyright case ${noticeId}: Your complaint was not upheld. The decision remains in effect.`,
              'Our reason: The supplied notice did not establish that this hosted use infringed.',
              'You may seek out-of-court dispute settlement under DSA Article 21 or judicial redress through a court.',
            ].join('\n\n'),
          },
        ],
        eu: {
          outcome: 'no_action',
          decided_at: '2026-07-01T12:10:00.000Z',
          informed_at: '2026-07-01T12:11:00.000Z',
          reopened_at: null,
          complaint: {
            can_submit: false,
            window_ends_at: '2027-01-01T12:11:00.000Z',
            request: {
              id: '00000000-0000-7000-8000-00000000121b',
              received_at: '2026-07-01T12:20:00.000Z',
              explanation: 'I disagree with the no-action decision for my notice.',
              filed_by: 'notifier',
            },
            decision: {
              staff_disposition: 'maintain',
              rationale: 'The supplied notice did not establish that this hosted use infringed.',
              decided_at: '2026-07-01T12:30:00.000Z',
            },
          },
          dispute_settlements: [
            {
              id: euSettlementId,
              body_name: 'Example certified dispute settlement body',
              referred_at: '2026-07-02T09:00:00.000Z',
              outcome: null,
            },
          ],
          dispute_settlements_page_info: {
            has_next_page: false,
            start_cursor: euSettlementStartCursor,
            end_cursor: null,
          },
        },
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'backend/services/copyright-notices/read-models-territorial.mts',
      'backend/services/copyright-notices/participant-statements.mts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.eu.territorial-complaints',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/territorial-complaints`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/territorial-complaints',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: { copyright_territorial_complaints: [], page_info: pageInfo },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/copyright-notices/case-collection-routes.mts'],
  },
  {
    id: 'web.copyright.eu.dispute-settlements.participant',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/eu-dispute-settlements',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-user',
    status: 200,
    body: { copyright_eu_dispute_settlements: [], page_info: pageInfo },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/case-collection-routes.mts',
      'web/lib/api/client/copyright-eu-dispute-settlements.ts',
    ],
  },
  {
    id: 'web.copyright.eu.dispute-settlements.staff',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements/staff`,
    route: {
      routeTemplate: '/api/v1/copyright-notices/:id/eu-dispute-settlements/staff',
      pathParams: { id: noticeId },
    },
    auth: 'fixture-admin',
    status: 200,
    body: { copyright_eu_dispute_settlements: [], page_info: pageInfo },
    consumers: ['web'],
    migratedFrom: ['backend/api/v1/copyright-notices/case-collection-routes.mts'],
  },
]
