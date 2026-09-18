import { predecessorIssue } from './predecessor-issue.mts'
import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const conversationId = '00000000-0000-7000-8000-000000000101'
const participantUserId = '00000000-0000-7000-8000-000000000002'
const migratedFrom = [predecessorIssue(6575)]

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-user',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom,
}

export const nativeMessageApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.messages.conversations.default',
    method: 'GET',
    path: '/api/v1/my/messages',
    route: { routeTemplate: '/api/v1/my/messages' },
    query: { limit: '50' },
    status: 200,
    body: responseBody('native.messages.conversations.default'),
  },
  {
    ...shared,
    id: 'native.messages.conversation.default',
    method: 'GET',
    path: `/api/v1/my/messages/${conversationId}`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId',
      pathParams: { conversationId },
    },
    status: 200,
    body: responseBody('native.messages.conversation.default'),
  },
  {
    ...shared,
    consumers: ['swift-core', 'dotnet-core'],
    id: 'native.messages.conversations.page-2',
    method: 'GET',
    path: '/api/v1/my/messages',
    route: { routeTemplate: '/api/v1/my/messages' },
    query: {
      after:
        'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDA5OjE1OjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiJ9',
      limit: '50',
    },
    status: 200,
    body: responseBody('native.messages.conversations.page-2'),
  },
  {
    ...shared,
    id: 'native.messages.create.default',
    method: 'POST',
    path: '/api/v1/my/messages',
    route: { routeTemplate: '/api/v1/my/messages' },
    requestBody: { user_ids: [participantUserId] },
    status: 201,
    body: responseBody('native.messages.create.default'),
  },
  {
    ...shared,
    id: 'native.messages.thread.default',
    method: 'GET',
    path: `/api/v1/my/messages/${conversationId}/messages`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/messages',
      pathParams: { conversationId },
    },
    query: { limit: '50' },
    status: 200,
    body: responseBody('native.messages.thread.default'),
  },
  {
    ...shared,
    id: 'native.messages.send.default',
    method: 'POST',
    path: `/api/v1/my/messages/${conversationId}/messages`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/messages',
      pathParams: { conversationId },
    },
    requestBody: { text: 'Sent from native' },
    status: 201,
    body: responseBody('native.messages.send.default'),
  },
  {
    ...shared,
    consumers: ['swift-core', 'dotnet-core'],
    id: 'native.messages.thread.page-2',
    method: 'GET',
    path: `/api/v1/my/messages/${conversationId}/messages`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/messages',
      pathParams: { conversationId },
    },
    query: {
      after: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSJ9',
      limit: '50',
    },
    status: 200,
    body: responseBody('native.messages.thread.page-2'),
  },
  {
    ...shared,
    id: 'native.messages.participants.default',
    method: 'GET',
    path: `/api/v1/my/messages/${conversationId}/participants`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/participants',
      pathParams: { conversationId },
    },
    status: 200,
    body: responseBody('native.messages.participants.default'),
  },
  {
    ...shared,
    id: 'native.messages.participant-add.default',
    method: 'POST',
    path: `/api/v1/my/messages/${conversationId}/participants`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/participants',
      pathParams: { conversationId },
    },
    requestBody: { user_id: '00000000-0000-7000-8000-000000000003' },
    status: 201,
    body: responseBody('native.messages.participant-add.default'),
  },
  {
    ...shared,
    id: 'native.messages.participant-remove.default',
    method: 'DELETE',
    path: `/api/v1/my/messages/${conversationId}/participants/${participantUserId}`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId/participants/:userId',
      pathParams: { conversationId, userId: participantUserId },
    },
    status: 204,
    body: null,
  },
  {
    ...shared,
    id: 'native.messages.policy.default',
    method: 'PATCH',
    path: `/api/v1/my/messages/${conversationId}`,
    route: {
      routeTemplate: '/api/v1/my/messages/:conversationId',
      pathParams: { conversationId },
    },
    requestBody: { participant_add_policy: 'owner_only' },
    status: 200,
    body: responseBody('native.messages.policy.default'),
  },
  {
    ...shared,
    id: 'native.messages.user-search.default',
    method: 'GET',
    path: '/api/v1/users',
    route: { routeTemplate: '/api/v1/users' },
    backendResponseContractKey: 'GET:/api/v1/users#search',
    query: { q: 'bo', limit: '10' },
    status: 200,
    body: responseBody('native.messages.user-search.default'),
  },
]
