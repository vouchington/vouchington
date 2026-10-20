import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const appealId = '00000000-0000-7000-8000-000000000102'
const memberCursor = Buffer.from(
  JSON.stringify({ id: appealId, scope: 'appeals:pending:user-1:id-desc' }),
).toString('base64url')
const source = ['backend/api/v1/appeals/appeals.mts']

export const nativeMemberAppealApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.appeals.member.default',
    backendResponseContractKey: 'GET:/api/v1/appeals#member',
    method: 'GET',
    path: '/api/v1/appeals',
    query: { limit: '25', status: 'pending' },
    route: { routeTemplate: '/api/v1/appeals' },
    auth: 'fixture-user',
    migratedFrom: source,
  }),
  fixtureCase({
    id: 'native.moderation.appeals.member.page-2',
    backendResponseContractKey: 'GET:/api/v1/appeals#member',
    method: 'GET',
    path: '/api/v1/appeals',
    query: { after: memberCursor, limit: '25', status: 'pending' },
    route: { routeTemplate: '/api/v1/appeals' },
    auth: 'fixture-user',
    migratedFrom: source,
  }),
  fixtureCase({
    id: 'native.moderation.appeals.member.resolved',
    backendResponseContractKey: 'GET:/api/v1/appeals#member',
    method: 'GET',
    path: '/api/v1/appeals',
    query: { limit: '25', status: 'resolved' },
    route: { routeTemplate: '/api/v1/appeals' },
    auth: 'fixture-user',
    migratedFrom: source,
  }),
  ...(['default', 'sent'] as const).map(state =>
    fixtureCase({
      id: `native.moderation.appeals.detail.member.${state}`,
      backendResponseContractKey: 'GET:/api/v1/appeals/:id#member',
      method: 'GET',
      path: `/api/v1/appeals/${appealId}`,
      route: { routeTemplate: '/api/v1/appeals/:id', pathParams: { id: appealId } },
      auth: 'fixture-user',
      migratedFrom: source,
    }),
  ),
  fixtureCase({
    id: 'native.moderation.appeals.create.member.default',
    backendResponseContractKey: 'POST:/api/v1/appeals#member',
    method: 'POST',
    path: '/api/v1/appeals',
    requestBody: { target_type: 'suspension', appeal_reason: '[other] Please review this again.' },
    route: { routeTemplate: '/api/v1/appeals' },
    auth: 'fixture-user',
    status: 201,
    migratedFrom: source,
  }),
]
