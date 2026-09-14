import type { ApiFixtureCase } from './types.mts'

export const webMembershipRefundApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.memberships.refund.completed',
    method: 'POST',
    path: '/api/v1/memberships/refunds',
    route: { routeTemplate: '/api/v1/memberships/refunds' },
    backendResponseContractKey: 'POST:/api/v1/memberships/refunds#completed',
    auth: 'fixture-admin',
    status: 201,
    requestBody: {
      user_id: '019fafb8-a44c-73e2-890a-497ff3dd27a6',
      charge_id: 'ch_fixture_refund',
      invoice_id: 'in_fixture_refund',
      reason: 'goodwill',
      cancel: false,
      idempotency_key: '00000000-0000-7000-8000-000000000901',
    },
    body: {
      outcome: 'completed',
      refund: { id: '019fafb8-a44c-73e2-890a-497ff3dd27a8' },
      cancellation_status: 'not_requested',
    },
    consumers: ['web'],
    migratedFrom: ['web/lib/api/client/memberships.ts'],
  },
  {
    id: 'web.memberships.refund.reconciling',
    method: 'POST',
    path: '/api/v1/memberships/refunds',
    route: { routeTemplate: '/api/v1/memberships/refunds' },
    backendResponseContractKey: 'POST:/api/v1/memberships/refunds#reconciling',
    auth: 'fixture-admin',
    status: 202,
    requestBody: {
      user_id: '019fafb8-a44c-73e2-890a-497ff3dd27a6',
      charge_id: 'ch_fixture_refund',
      invoice_id: 'in_fixture_refund',
      reason: 'goodwill',
      cancel: false,
      idempotency_key: '00000000-0000-7000-8000-000000000901',
    },
    body: { outcome: 'reconciling', retry_after_seconds: 300 },
    consumers: ['web'],
    migratedFrom: ['web/lib/api/client/memberships.ts'],
  },
]
