import { responseBody } from './static-response-bodies.mts'
import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const disputeId = '00000000-0000-7000-8000-000000000201'
const defaultBody = responseBody('native.moderation.disputes.default') as {
  disputes: Array<Record<string, unknown>>
  page_info: Record<string, unknown>
}
const pendingDispute = defaultBody.disputes[0]!

function disputeBody(overrides: Record<string, unknown> = {}) {
  return { dispute: { ...pendingDispute, ...overrides } }
}

const disputeRoute = {
  routeTemplate: '/api/v1/disputes/:id',
  pathParams: { id: disputeId },
} as const

export const nativeModerationDisputeApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.disputes.default',
    backendResponseContractKey: 'GET:/api/v1/disputes#staff',
    method: 'GET',
    path: '/api/v1/disputes',
    query: { limit: '25', status: 'pending' },
    route: { routeTemplate: '/api/v1/disputes' },
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.disputes.detail.default',
    backendResponseContractKey: 'GET:/api/v1/disputes/:id#staff',
    method: 'GET',
    path: `/api/v1/disputes/${disputeId}`,
    route: disputeRoute,
    body: disputeBody(),
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.disputes.update.default',
    backendResponseContractKey: 'PATCH:/api/v1/disputes/:id#staff',
    method: 'PATCH',
    path: `/api/v1/disputes/${disputeId}`,
    requestBody: {
      internal_notes: 'Reviewed against the content policy.',
      public_response: 'We reviewed your dispute.',
    },
    route: disputeRoute,
    body: disputeBody({
      drafted_at: '2026-06-01T12:05:00.000Z',
      edited_at: '2026-06-01T12:05:00.000Z',
      edited_by_id: 'staff-1',
      internal_notes: 'Reviewed against the content policy.',
      public_response: 'We reviewed your dispute.',
    }),
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.disputes.approval.default',
    backendResponseContractKey: 'POST:/api/v1/disputes/:id/approval#staff',
    method: 'POST',
    path: `/api/v1/disputes/${disputeId}/approval`,
    route: {
      routeTemplate: '/api/v1/disputes/:id/approval',
      pathParams: { id: disputeId },
    },
    body: disputeBody({
      approved_at: '2026-06-01T12:10:00.000Z',
      approved_by_id: 'staff-1',
    }),
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.disputes.delivery.default',
    backendResponseContractKey: 'POST:/api/v1/disputes/:id/delivery#staff',
    method: 'POST',
    path: `/api/v1/disputes/${disputeId}/delivery`,
    route: {
      routeTemplate: '/api/v1/disputes/:id/delivery',
      pathParams: { id: disputeId },
    },
    body: disputeBody({
      sent_at: '2026-06-01T12:15:00.000Z',
    }),
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
  ...(['remove', 'annotate', 'dismiss'] as const).map(action =>
    fixtureCase({
      id: `native.moderation.disputes.resolution.${action}`,
      backendResponseContractKey: 'POST:/api/v1/disputes/:id/resolution#staff',
      method: 'POST',
      path: `/api/v1/disputes/${disputeId}/resolution`,
      requestBody:
        action === 'annotate'
          ? { action, body_text: 'This review reflects a disputed experience.' }
          : { action },
      route: {
        routeTemplate: '/api/v1/disputes/:id/resolution',
        pathParams: { id: disputeId },
      },
      body: disputeBody({
        resolution_action: action,
        resolved_at: '2026-06-01T12:20:00.000Z',
        resolved_by_id: 'staff-1',
        status: 'resolved',
      }),
      migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
    }),
  ),
  fixtureCase({
    id: 'native.moderation.disputes.resolution-drafts.default',
    backendResponseContractKey: 'POST:/api/v1/disputes/:id/resolution-drafts#staff',
    method: 'POST',
    path: `/api/v1/disputes/${disputeId}/resolution-drafts`,
    route: {
      routeTemplate: '/api/v1/disputes/:id/resolution-drafts',
      pathParams: { id: disputeId },
    },
    body: { queued: true, rerun_by_id: 'staff-1' },
    status: 202,
    migratedFrom: ['backend/api/v1/disputes/disputes.mts'],
  }),
]
