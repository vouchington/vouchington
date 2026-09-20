import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'
import { nativeMembershipGrantApiFixtureCases } from './native-membership-grant-cases.mts'
import { predecessorIssue } from './predecessor-issue.mts'

const membershipProductId = '00000000-0000-7000-8000-000000000701'
const membershipPurchaseIntentId = '00000000-0000-7000-8000-000000000803'
const membershipVerificationId = '00000000-0000-7000-8000-000000000807'
const migratedFrom = [predecessorIssue(7880)]

const nativeConsumers: ApiFixtureCase['consumers'] = ['swift-core', 'swift-ui', 'dotnet-core']
const deferredNativeConsumers: ApiFixtureCase['consumers'] = []

export const nativeMembershipApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.memberships.plans.default',
    method: 'GET',
    path: '/api/v1/memberships/plans',
    route: { routeTemplate: '/api/v1/memberships/plans' },
    auth: 'none',
    status: 200,
    body: responseBody('native.memberships.plans.default'),
    consumers: nativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.me.default',
    method: 'GET',
    path: '/api/v1/memberships/me',
    route: { routeTemplate: '/api/v1/memberships/me' },
    auth: 'fixture-user',
    status: 200,
    body: responseBody('native.memberships.me.default'),
    consumers: nativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.me.lifecycle.default',
    method: 'GET',
    path: '/api/v1/memberships/me',
    route: { routeTemplate: '/api/v1/memberships/me' },
    auth: 'fixture-user',
    status: 200,
    body: responseBody('native.memberships.me.lifecycle.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.purchase-intent.apple.default',
    method: 'POST',
    path: '/api/v1/membership-purchase-intents',
    route: { routeTemplate: '/api/v1/membership-purchase-intents' },
    requestBody: {
      provider: 'apple_app_store',
      product_id: membershipProductId,
      idempotency_key: membershipPurchaseIntentId,
    },
    auth: 'fixture-user',
    status: 201,
    body: responseBody('native.memberships.purchase-intent.apple.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.purchase-intent.google.default',
    method: 'POST',
    path: '/api/v1/membership-purchase-intents',
    route: { routeTemplate: '/api/v1/membership-purchase-intents' },
    requestBody: {
      provider: 'google_play',
      product_id: membershipProductId,
      idempotency_key: '00000000-0000-7000-8000-000000000804',
    },
    auth: 'fixture-user',
    status: 201,
    body: responseBody('native.memberships.purchase-intent.google.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.purchase-intent.microsoft.default',
    method: 'POST',
    path: '/api/v1/membership-purchase-intents',
    route: { routeTemplate: '/api/v1/membership-purchase-intents' },
    requestBody: {
      provider: 'microsoft_store',
      product_id: membershipProductId,
      idempotency_key: '00000000-0000-7000-8000-000000000805',
    },
    auth: 'fixture-user',
    status: 201,
    body: responseBody('native.memberships.purchase-intent.microsoft.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.microsoft.service-tickets.default',
    method: 'POST',
    path: '/api/v1/memberships/microsoft-store/service-tickets',
    route: { routeTemplate: '/api/v1/memberships/microsoft-store/service-tickets' },
    requestBody: {},
    auth: 'fixture-user',
    status: 200,
    body: responseBody('native.memberships.microsoft.service-tickets.default'),
    consumers: deferredNativeConsumers,
    migratedFrom: [predecessorIssue(11535)],
  },
  {
    id: 'native.memberships.purchase-intent.stripe.default',
    method: 'POST',
    path: '/api/v1/membership-purchase-intents',
    route: { routeTemplate: '/api/v1/membership-purchase-intents' },
    requestBody: {
      provider: 'stripe',
      product_id: membershipProductId,
      idempotency_key: '00000000-0000-7000-8000-000000000806',
    },
    auth: 'fixture-user',
    status: 201,
    body: responseBody('native.memberships.purchase-intent.stripe.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.purchase-intent.conflict.default',
    method: 'POST',
    path: '/api/v1/membership-purchase-intents',
    route: { routeTemplate: '/api/v1/membership-purchase-intents' },
    requestBody: {
      provider: 'apple_app_store',
      product_id: membershipProductId,
      idempotency_key: '00000000-0000-7000-8000-000000000811',
    },
    auth: 'fixture-user',
    status: 409,
    backendResponseContractKey: 'POST:/api/v1/membership-purchase-intents#conflict',
    body: responseBody('native.memberships.purchase-intent.conflict.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.verification.pending.default',
    method: 'POST',
    path: '/api/v1/membership-verifications',
    route: { routeTemplate: '/api/v1/membership-verifications' },
    requestBody: {
      provider: 'apple_app_store',
      purchase_intent_id: membershipPurchaseIntentId,
      idempotency_key: membershipVerificationId,
      evidence: { signed_transaction: 'fixture-signed-transaction' },
    },
    auth: 'fixture-user',
    status: 202,
    body: responseBody('native.memberships.verification.pending.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.verification-status.pending.default',
    method: 'GET',
    path: `/api/v1/membership-verifications/${membershipVerificationId}`,
    route: {
      routeTemplate: '/api/v1/membership-verifications/:verificationId',
      pathParams: { verificationId: membershipVerificationId },
    },
    auth: 'fixture-user',
    status: 200,
    body: responseBody('native.memberships.verification-status.pending.default'),
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
  ...(
    [
      ['verified', '00000000-0000-7000-8000-000000000808'],
      ['conflict', '00000000-0000-7000-8000-000000000809'],
      ['rejected', '00000000-0000-7000-8000-000000000810'],
    ] as const
  ).map(([status, verificationId]) => ({
    id: `native.memberships.verification-status.${status}.default`,
    method: 'GET' as const,
    path: `/api/v1/membership-verifications/${verificationId}`,
    route: {
      routeTemplate: '/api/v1/membership-verifications/:verificationId',
      pathParams: {
        verificationId,
      },
    },
    auth: 'fixture-user' as const,
    status: 200,
    body: responseBody(`native.memberships.verification-status.${status}.default`),
    consumers: deferredNativeConsumers,
    migratedFrom,
  })),
  ...nativeMembershipGrantApiFixtureCases,
]
