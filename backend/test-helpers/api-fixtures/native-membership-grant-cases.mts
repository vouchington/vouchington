import { predecessorIssue } from './predecessor-issue.mts'
import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const membershipGrantUserId = '00000000-0000-7000-8000-000000000003'
const membershipGrantSkuId = '00000000-0000-7000-8000-000000000701'
const membershipGrantId = '00000000-0000-7000-8000-000000000802'
const migratedFrom = [predecessorIssue(7880)]
const nativeConsumers: ApiFixtureCase['consumers'] = ['swift-core', 'swift-ui', 'dotnet-core']
const deferredNativeConsumers: ApiFixtureCase['consumers'] = []

export const nativeMembershipGrantApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.memberships.grant.default',
    method: 'POST',
    path: '/api/v1/membership-grants',
    route: { routeTemplate: '/api/v1/membership-grants' },
    requestBody: {
      user_id: membershipGrantUserId,
      plan: 'plus',
      sku_id: membershipGrantSkuId,
      duration_days: 30,
    },
    auth: 'fixture-admin',
    status: 201,
    body: responseBody('native.memberships.grant.default'),
    consumers: nativeConsumers,
    migratedFrom,
  },
  {
    id: 'native.memberships.grant.delete.default',
    method: 'DELETE',
    path: `/api/v1/membership-grants/${membershipGrantId}`,
    route: {
      routeTemplate: '/api/v1/membership-grants/:grantId',
      pathParams: { grantId: membershipGrantId },
    },
    requestBody: { reason: 'Incorrect grant' },
    auth: 'fixture-admin',
    status: 204,
    body: null,
    consumers: deferredNativeConsumers,
    migratedFrom,
  },
]
