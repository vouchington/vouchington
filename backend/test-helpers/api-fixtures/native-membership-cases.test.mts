import { describe, expect, it } from 'vitest'

import { nativeMembershipApiFixtureCases } from './native-membership-cases.mts'

describe('native membership fixtures', () => {
  it('publishes provider-neutral membership contracts', () => {
    const plans = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.plans.default',
    )!
    const grant = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.grant.default',
    )!
    const revokeGrant = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.grant.delete.default',
    )!
    const currentMembership = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.me.default',
    )!
    const applePurchaseIntent = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.purchase-intent.apple.default',
    )!
    const verification = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.verification.pending.default',
    )!
    const verificationStatus = nativeMembershipApiFixtureCases.find(
      fixture => fixture.id === 'native.memberships.verification-status.pending.default',
    )!
    const terminalStatuses = nativeMembershipApiFixtureCases
      .filter(fixture => fixture.id.match(/verification-status\.(verified|conflict|rejected)/))
      .map(fixture => (fixture.body as { verification: { status: string } }).verification.status)

    expect(plans).toMatchObject({
      auth: 'none',
      consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
      method: 'GET',
      path: '/api/v1/memberships/plans',
      status: 200,
    })
    expect(plans.body).toMatchObject({
      products: expect.arrayContaining([
        expect.objectContaining({
          interval: 'monthly',
          plan: 'plus',
          providers: expect.arrayContaining([
            expect.objectContaining({ provider: 'apple_app_store', price: null }),
            expect.objectContaining({ provider: 'stripe' }),
          ]),
        }),
      ]),
    })
    expect(currentMembership).toMatchObject({
      auth: 'fixture-user',
      method: 'GET',
      path: '/api/v1/memberships/me',
      status: 200,
      body: {
        management: null,
        membership: null,
        pending: { financial_operations: [], grants: 0, switches: [], verifications: [] },
        sources: [],
      },
    })
    expect(applePurchaseIntent).toMatchObject({
      auth: 'fixture-user',
      method: 'POST',
      path: '/api/v1/membership-purchase-intents',
      requestBody: {
        idempotency_key: '00000000-0000-7000-8000-000000000803',
        product_id: '00000000-0000-7000-8000-000000000701',
        provider: 'apple_app_store',
      },
      status: 201,
      body: {
        purchase_intent: expect.objectContaining({
          launch: expect.objectContaining({ kind: 'apple_app_store' }),
        }),
      },
    })
    expect(verification).toMatchObject({
      auth: 'fixture-user',
      method: 'POST',
      path: '/api/v1/membership-verifications',
      status: 202,
      body: { verification: expect.objectContaining({ status: 'pending' }) },
    })
    expect(verificationStatus).toMatchObject({
      auth: 'fixture-user',
      method: 'GET',
      path: '/api/v1/membership-verifications/00000000-0000-7000-8000-000000000807',
      status: 200,
    })
    expect(terminalStatuses).toEqual(['verified', 'conflict', 'rejected'])
    expect(grant).toMatchObject({
      auth: 'fixture-admin',
      consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
      method: 'POST',
      path: '/api/v1/membership-grants',
      requestBody: {
        user_id: '00000000-0000-7000-8000-000000000003',
        plan: 'plus',
        sku_id: '00000000-0000-7000-8000-000000000701',
        duration_days: 30,
      },
      status: 201,
    })
    expect(revokeGrant).toMatchObject({
      auth: 'fixture-admin',
      consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
      method: 'DELETE',
      path: '/api/v1/membership-grants/00000000-0000-7000-8000-000000000802',
      requestBody: { reason: 'Incorrect grant' },
      route: {
        routeTemplate: '/api/v1/membership-grants/:grantId',
        pathParams: { grantId: '00000000-0000-7000-8000-000000000802' },
      },
      status: 204,
    })
  })
})
