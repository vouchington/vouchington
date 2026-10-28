import type { ManifestEndpoint } from './endpoint-registry'
import {
  createMembershipPurchaseIntent,
  fetchPlans,
  grantMembership,
} from '../../../../../lib/api/client/memberships'

type EndpointFromClientHelper = (callHelper: () => unknown) => ManifestEndpoint

export function createNonWebMembershipEndpointRegistry(
  endpointFromClientHelper: EndpointFromClientHelper,
): Record<string, ManifestEndpoint> {
  return {
    'native.memberships.plans.default': endpointFromClientHelper(() => fetchPlans()),
    'native.memberships.me.default': { method: 'GET', path: '/api/v1/memberships/me' },
    'native.memberships.me.lifecycle.default': { method: 'GET', path: '/api/v1/memberships/me' },
    'native.memberships.microsoft.service-tickets.default': {
      method: 'POST',
      path: '/api/v1/memberships/microsoft-store/service-tickets',
      requestBody: {},
    },
    'native.memberships.purchase-intent.apple.default': endpointFromClientHelper(() =>
      createMembershipPurchaseIntent(
        'apple_app_store',
        '00000000-0000-7000-8000-000000000701',
        '00000000-0000-7000-8000-000000000803',
      ),
    ),
    'native.memberships.purchase-intent.google.default': endpointFromClientHelper(() =>
      createMembershipPurchaseIntent(
        'google_play',
        '00000000-0000-7000-8000-000000000701',
        '00000000-0000-7000-8000-000000000804',
      ),
    ),
    'native.memberships.purchase-intent.microsoft.default': endpointFromClientHelper(() =>
      createMembershipPurchaseIntent(
        'microsoft_store',
        '00000000-0000-7000-8000-000000000701',
        '00000000-0000-7000-8000-000000000805',
      ),
    ),
    'native.memberships.purchase-intent.stripe.default': endpointFromClientHelper(() =>
      createMembershipPurchaseIntent(
        'stripe',
        '00000000-0000-7000-8000-000000000701',
        '00000000-0000-7000-8000-000000000806',
      ),
    ),
    'native.memberships.purchase-intent.conflict.default': endpointFromClientHelper(() =>
      createMembershipPurchaseIntent(
        'apple_app_store',
        '00000000-0000-7000-8000-000000000701',
        '00000000-0000-7000-8000-000000000811',
      ),
    ),
    'native.memberships.verification.pending.default': {
      method: 'POST',
      path: '/api/v1/membership-verifications',
      requestBody: {
        provider: 'apple_app_store',
        purchase_intent_id: '00000000-0000-7000-8000-000000000803',
        idempotency_key: '00000000-0000-7000-8000-000000000807',
        evidence: { signed_transaction: 'fixture-signed-transaction' },
      },
    },
    'native.memberships.verification-status.pending.default': {
      method: 'GET',
      path: '/api/v1/membership-verifications/00000000-0000-7000-8000-000000000807',
    },
    'native.memberships.verification-status.verified.default': {
      method: 'GET',
      path: '/api/v1/membership-verifications/00000000-0000-7000-8000-000000000808',
    },
    'native.memberships.verification-status.conflict.default': {
      method: 'GET',
      path: '/api/v1/membership-verifications/00000000-0000-7000-8000-000000000809',
    },
    'native.memberships.verification-status.rejected.default': {
      method: 'GET',
      path: '/api/v1/membership-verifications/00000000-0000-7000-8000-000000000810',
    },
    'native.memberships.grant.default': endpointFromClientHelper(() =>
      grantMembership(
        '00000000-0000-7000-8000-000000000003',
        'plus',
        '00000000-0000-7000-8000-000000000701',
        30,
      ),
    ),
    'native.memberships.grant.delete.default': {
      method: 'DELETE',
      path: '/api/v1/membership-grants/00000000-0000-7000-8000-000000000802',
      requestBody: { reason: 'Incorrect grant' },
    },
  }
}
