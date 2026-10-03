import type { ApiFixtureCase } from './types.mts'

const noticeId = '00000000-0000-7000-8000-000000000804'
const targetId = '00000000-0000-7000-8000-000000000805'
const claimant = {
  user_id: '00000000-0000-7000-8000-000000000806',
  display_name: 'Current claimant',
}

const noticeDetail = (profile: typeof claimant | null) => ({
  id: noticeId,
  jurisdiction: 'us_dmca',
  received_at: '2026-07-01T12:00:00.000Z',
  accepted_at: '2026-07-01T12:01:00.000Z',
  provisional_withholding_at: '2026-07-01T12:01:00.000Z',
  target_count: 1,
  claimant: profile,
  targets: [
    {
      id: targetId,
      hosted_use_url: 'https://voucha.ai/posts/fixture',
      restriction_status: 'active',
    },
  ],
  timeline: [
    {
      id: '00000000-0000-7000-8000-000000000807',
      event_type: 'notice_received',
      created_at: '2026-07-01T12:00:00.000Z',
    },
    {
      id: '00000000-0000-7000-8000-0000000008f1',
      event_type: 'provisional_restriction_imposed',
      created_at: '2026-07-01T12:01:00.000Z',
    },
  ],
})

export const nativeCopyrightClaimantApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.copyright.notices.default',
    method: 'GET',
    path: '/api/v1/copyright-notices',
    route: { routeTemplate: '/api/v1/copyright-notices' },
    auth: 'fixture-user',
    status: 200,
    body: {
      copyright_notices: [
        {
          id: noticeId,
          jurisdiction: 'us_dmca',
          received_at: '2026-07-01T12:00:00.000Z',
          accepted_at: '2026-07-01T12:01:00.000Z',
          provisional_withholding_at: '2026-07-01T12:01:00.000Z',
          target_count: 1,
          claimant,
        },
      ],
      page_info: {
        has_next_page: true,
        start_cursor: 'copyright-notices-first',
        end_cursor: 'copyright-notices-next',
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.notices.null-claimant',
    method: 'GET',
    path: '/api/v1/copyright-notices',
    route: { routeTemplate: '/api/v1/copyright-notices' },
    auth: 'fixture-user',
    status: 200,
    body: {
      copyright_notices: [
        {
          id: noticeId,
          jurisdiction: 'us_dmca',
          received_at: '2026-07-01T12:00:00.000Z',
          accepted_at: '2026-07-01T12:01:00.000Z',
          provisional_withholding_at: null,
          target_count: 1,
          claimant: null,
        },
      ],
      page_info: { has_next_page: false, start_cursor: 'copyright-notices-null', end_cursor: null },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.notice.detail.populated',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}`,
    route: { routeTemplate: '/api/v1/copyright-notices/:id', pathParams: { id: noticeId } },
    auth: 'fixture-user',
    status: 200,
    body: { copyright_notice: noticeDetail(claimant) },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.notice.detail.null-claimant',
    method: 'GET',
    path: `/api/v1/copyright-notices/${noticeId}`,
    route: { routeTemplate: '/api/v1/copyright-notices/:id', pathParams: { id: noticeId } },
    auth: 'fixture-user',
    status: 200,
    body: { copyright_notice: noticeDetail(null) },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.notice.participant.populated',
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
        ...noticeDetail(claimant),
        viewer_role: 'claimant',
        respondable_target_ids: [],
        submissions: [],
        statements: [
          {
            id: '00000000-0000-7000-8000-0000000008f2',
            delivery_kind: 'claimant_decision_notice',
            state: 'sent',
            sent_at: '2026-07-01T12:02:00.000Z',
            text: 'A person confirmed the image restriction. See the case page for redress routes.',
          },
        ],
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
  {
    id: 'web.copyright.notice.participant.null-claimant',
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
        ...noticeDetail(null),
        viewer_role: 'poster',
        respondable_target_ids: [targetId],
        submissions: [],
        statements: [],
      },
    },
    consumers: ['web'],
    migratedFrom: [
      'backend/api/v1/copyright-notices/index.mts',
      'web/lib/api/client/copyright-notices.ts',
      'web/lib/api/server/copyright-notices.ts',
    ],
  },
]
