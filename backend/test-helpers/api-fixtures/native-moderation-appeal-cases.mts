import { nativeModerationFixtureCase as fixtureCase } from './native-moderation-fixture-case.mts'

const appealId = '00000000-0000-7000-8000-000000000102'
const appealFirstPageCursor =
  'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiIsInNjb3BlIjoiYXBwZWFsczpwZW5kaW5nOnN0YWZmLWFsbDppZC1kZXNjIn0'

export const nativeModerationAppealApiFixtureCases = [
  fixtureCase({
    id: 'native.moderation.appeals.default',
    backendResponseContractKey: 'GET:/api/v1/appeals#staff',
    method: 'GET',
    path: '/api/v1/appeals',
    query: { limit: '25', status: 'pending' },
    route: { routeTemplate: '/api/v1/appeals' },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.page-2',
    backendResponseContractKey: 'GET:/api/v1/appeals#staff',
    method: 'GET',
    path: '/api/v1/appeals',
    query: { after: appealFirstPageCursor, limit: '25', status: 'pending' },
    route: { routeTemplate: '/api/v1/appeals' },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.update.default',
    backendResponseContractKey: 'PATCH:/api/v1/appeals/:id#staff',
    method: 'PATCH',
    path: `/api/v1/appeals/${appealId}`,
    requestBody: { public_response: 'We reviewed your appeal and reduced the action.' },
    route: {
      routeTemplate: '/api/v1/appeals/:id',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.approval.default',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/approval#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/approval`,
    route: {
      routeTemplate: '/api/v1/appeals/:id/approval',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.delivery.default',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/delivery#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/delivery`,
    route: {
      routeTemplate: '/api/v1/appeals/:id/delivery',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.resolution.accept',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/resolution#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/resolution`,
    requestBody: { action: 'accept' },
    route: {
      routeTemplate: '/api/v1/appeals/:id/resolution',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.resolution.reduce',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/resolution#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/resolution`,
    requestBody: { action: 'reduce' },
    route: {
      routeTemplate: '/api/v1/appeals/:id/resolution',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.resolution.deny',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/resolution#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/resolution`,
    requestBody: { action: 'deny' },
    route: {
      routeTemplate: '/api/v1/appeals/:id/resolution',
      pathParams: { id: appealId },
    },
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
  fixtureCase({
    id: 'native.moderation.appeals.resolution-drafts.default',
    backendResponseContractKey: 'POST:/api/v1/appeals/:id/resolution-drafts#staff',
    method: 'POST',
    path: `/api/v1/appeals/${appealId}/resolution-drafts`,
    route: {
      routeTemplate: '/api/v1/appeals/:id/resolution-drafts',
      pathParams: { id: appealId },
    },
    status: 202,
    migratedFrom: ['backend/api/v1/appeals/appeals.mts'],
  }),
]
