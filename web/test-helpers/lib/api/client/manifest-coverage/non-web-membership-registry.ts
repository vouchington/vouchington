import type { ManifestEndpoint } from './endpoint-registry'
import {
  createMicrosoftStoreServiceTickets,
  createMembershipPurchaseIntent,
  createMembershipVerification,
  fetchMembershipVerification,
  fetchPlans,
  grantMembership,
  revokeMembershipGrant,
} from '../../../../../lib/api/client/memberships'

type EndpointFromClientHelper = (callHelper: () => unknown) => ManifestEndpoint

export function createNonWebMembershipEndpointRegistry(
  endpointFromClientHelper: EndpointFromClientHelper,
): Record<string, ManifestEndpoint> {
  return {
    'native.memberships.plans.default': endpointFromClientHelper(() => fetchPlans()),
    'native.memberships.me.default': { method: 'GET', path: '/api/v1/memberships/me' },
    'native.memberships.me.lifecycle.default': { method: 'GET', path: '/api/v1/memberships/me' },
    'native.memberships.microsoft.service-tickets.default': endpointFromClientHelper(() =>
      createMicrosoftStoreServiceTickets(),
    ),
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
    'native.memberships.verification.pending.default': endpointFromClientHelper(() =>
      createMembershipVerification({
        provider: 'apple_app_store',
        purchase_intent_id: '00000000-0000-7000-8000-000000000803',
        idempotency_key: '00000000-0000-7000-8000-000000000807',
        evidence: { signed_transaction: 'fixture-signed-transaction' },
      }),
    ),
    'native.memberships.verification-status.pending.default': endpointFromClientHelper(() =>
      fetchMembershipVerification('00000000-0000-7000-8000-000000000807'),
    ),
    'native.memberships.verification-status.verified.default': endpointFromClientHelper(() =>
      fetchMembershipVerification('00000000-0000-7000-8000-000000000808'),
    ),
    'native.memberships.verification-status.conflict.default': endpointFromClientHelper(() =>
      fetchMembershipVerification('00000000-0000-7000-8000-000000000809'),
    ),
    'native.memberships.verification-status.rejected.default': endpointFromClientHelper(() =>
      fetchMembershipVerification('00000000-0000-7000-8000-000000000810'),
    ),
    'native.memberships.grant.default': endpointFromClientHelper(() =>
      grantMembership(
        '00000000-0000-7000-8000-000000000003',
        'plus',
        '00000000-0000-7000-8000-000000000701',
        30,
      ),
    ),
    'native.memberships.grant.delete.default': endpointFromClientHelper(() =>
      revokeMembershipGrant('00000000-0000-7000-8000-000000000802', 'Incorrect grant'),
    ),
  }
}
