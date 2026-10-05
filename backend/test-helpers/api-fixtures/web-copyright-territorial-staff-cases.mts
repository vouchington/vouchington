import type { ApiFixtureCase } from './types.mts'

const euNoticeId = '00000000-0000-7000-8000-000000001906'
const ukNoticeId = '00000000-0000-7000-8000-000000001907'
const emptyPage = { has_next_page: false, start_cursor: null, end_cursor: null }
const acknowledgment = {
  attempt_count: 1,
  last_attempt_at: '2026-10-04T10:00:00.000Z',
  acknowledged_at: '2026-10-04T10:01:00.000Z',
  exhausted_at: null,
  escalated: false,
}
const sharedCase = {
  received_at: '2026-10-04T09:00:00.000Z',
  claimant: { display_name: 'Rights representative', contact: 'rights@example.test', misuse: null },
  work_description: 'Original photograph of a garden.',
  targets: [],
  evidence: [],
  form_review: null,
  restrictions: [],
  appeals: [],
  counter_notices: [],
  legal_holds: [],
  action_intents: [],
  delivery_intents: [],
  staydown_matches: [],
  email_correspondence: [],
  waiting_since: '2026-10-04T10:01:00.000Z',
  next_deadline: null,
}

/** Staff queue states used by the EU/UK decision, complaint, and Art. 21 web screen. */
export const webCopyrightTerritorialStaffApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.staff-queue.territorial',
    method: 'GET',
    path: '/api/v1/copyright-notices/review-queue',
    route: { routeTemplate: '/api/v1/copyright-notices/review-queue' },
    auth: 'fixture-admin',
    status: 200,
    body: {
      copyright_notices: [
        {
          ...sharedCase,
          id: euNoticeId,
          jurisdiction: 'eu_dsa',
          waiting_since: '2026-10-04T09:00:00.000Z',
          reasons: ['territorial_notice_review'],
          territorial: {
            hosted_use_url: 'https://voucha.ai/discussion/garden-photo',
            grounds: 'The hosted post reproduces the original photograph.',
            notifier: { name: 'Rights representative', email: 'rights@example.test' },
            acknowledgment,
            decision: null,
            reopened_at: null,
            recipients: [],
            complaints: [],
            complaints_page_info: emptyPage,
            dispute_settlements: [],
            dispute_settlements_page_info: emptyPage,
          },
        },
        {
          ...sharedCase,
          id: ukNoticeId,
          jurisdiction: 'uk',
          claimant: { display_name: 'Park Images', contact: 'park@example.test', misuse: null },
          waiting_since: '2026-10-04T11:00:00.000Z',
          targets: [
            {
              id: '00000000-0000-7000-8000-00000000190b',
              placement_key: 'image-placement:00000000-0000-7000-8000-00000000190c',
              placement_revision: 1,
              image_id: '00000000-0000-7000-8000-00000000190d',
              hosted_use_url: 'https://voucha.ai/discussion/park-photo',
              surface: 'post-image',
              provenance: null,
            },
          ],
          restrictions: [
            {
              id: '00000000-0000-7000-8000-00000000190e',
              target_id: '00000000-0000-7000-8000-00000000190b',
              imposed_at: '2026-10-04T10:30:00.000Z',
              status: 'confirmed',
            },
          ],
          reasons: ['territorial_redress_review'],
          territorial: {
            hosted_use_url: 'https://voucha.ai/discussion/park-photo',
            grounds: 'The hosted post reproduces the original park photograph.',
            notifier: { name: 'Park Images', email: 'park@example.test' },
            acknowledgment,
            decision: {
              id: '00000000-0000-7000-8000-000000001908',
              outcome: 'restrict',
              decided_at: '2026-10-04T10:30:00.000Z',
              rationale: 'The evidence identifies the hosted image.',
              public_explanation: 'The hosted photograph matches the notified work.',
            },
            reopened_at: null,
            recipients: [
              {
                role: 'poster',
                user_id: '00000000-0000-7000-8000-000000001909',
                informed_at: '2026-10-04T10:35:00.000Z',
                state: 'sent',
              },
            ],
            complaints: [
              {
                id: '00000000-0000-7000-8000-00000000190a',
                filed_by: 'poster',
                submitted_by_id: '00000000-0000-7000-8000-000000001909',
                received_at: '2026-10-04T11:00:00.000Z',
                explanation: 'The image was licensed for this use.',
                informed_at: '2026-10-04T10:35:00.000Z',
                window_ends_at: '2027-04-04T10:35:00.000Z',
                decision: null,
              },
            ],
            complaints_page_info: emptyPage,
            dispute_settlements: [],
            dispute_settlements_page_info: emptyPage,
          },
        },
      ],
      page_info: emptyPage,
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/staff-queue-route.mts',
      'web/components/copyright/copyright-staff-territorial.tsx',
    ],
  },
]
