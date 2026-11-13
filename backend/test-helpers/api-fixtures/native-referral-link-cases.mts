import { pageInfo } from './data.mts'
import { publicReferralLink } from './referral-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const nativeReferralLinkFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.referral-links.user.public',
    method: 'GET',
    path: '/api/v1/referral-links',
    route: { routeTemplate: '/api/v1/referral-links' },
    query: { user_id: publicReferralLink.user_id, limit: '25' },
    auth: 'fixture-user',
    status: 200,
    backendResponseContractKey: 'GET:/api/v1/referral-links#public',
    body: { results: [publicReferralLink], page_info: pageInfo },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: ['web/lib/api/client/referral-links.ts'],
  },
]
