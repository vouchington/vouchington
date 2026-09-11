import { vi } from 'vitest'
import type { ManifestEndpoint } from './endpoint-registry'
import { grantIdentityVerificationAttempt } from '../../identity-verification'
import {
  addConversationParticipant,
  createDirectConversation,
  getConversationParticipantsClient,
  getDirectMessageThreadClient,
  getMyMessagesClient,
  removeConversationParticipant,
  sendDirectMessage,
  updateConversationParticipantPolicy,
} from '../../messages'
import { sendPostToFollowers, sharePostWithFollowers } from '../../posts'
import { sendRssFeedItemToFollowers, shareRssFeedItemWithFollowers } from '../../rss-feeds'
import { fetchFollowerUsers, searchUsers } from '../../users'
import { createNonWebMembershipEndpointRegistry } from './non-web-membership-registry'

type CapturedClientCall = ManifestEndpoint
type ClientApiMock = (path: string, bodyOrOptions?: unknown) => Promise<unknown>

const { capturedClientCalls, mockedClientApi } = vi.hoisted(() => {
  const capturedClientCalls: CapturedClientCall[] = []

  function capture(
    method: ManifestEndpoint['method'],
    path: string,
    bodyOrOptions?: unknown,
  ): Promise<unknown> {
    const endpoint: CapturedClientCall = { method, path }
    if (method === 'GET') {
      const query = queryFromOptions(bodyOrOptions)
      if (query) endpoint.query = query
    } else if (bodyOrOptions !== undefined) {
      endpoint.requestBody = bodyOrOptions
    }
    capturedClientCalls.push(endpoint)
    return Promise.resolve({})
  }

  function queryFromOptions(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value) || !isRecord(value.searchParams)) return undefined
    const query = Object.fromEntries(
      Object.entries(value.searchParams)
        .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
        .map(([key, entryValue]) => [key, String(entryValue)]),
    )
    return Object.keys(query).length === 0 ? undefined : query
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
  }

  return {
    capturedClientCalls,
    mockedClientApi: {
      get: vi.fn<ClientApiMock>((path, options) => capture('GET', path, options)),
      delete: vi.fn<ClientApiMock>((path, options) =>
        capture('DELETE', path, isRecord(options) && 'body' in options ? options.body : undefined),
      ),
      patch: vi.fn<ClientApiMock>((path, body) => capture('PATCH', path, body)),
      post: vi.fn<ClientApiMock>((path, body) => capture('POST', path, body)),
      put: vi.fn<ClientApiMock>((path, body) => capture('PUT', path, body)),
    },
  }
})

vi.mock(
  import('../../instance'),
  () =>
    ({
      clientApi: mockedClientApi,
    }) as unknown as typeof import('../../instance'),
)

function endpointFromClientHelper(callHelper: () => unknown): ManifestEndpoint {
  capturedClientCalls.length = 0
  callHelper()
  if (capturedClientCalls.length !== 1) {
    throw new Error(
      `Expected client helper to call clientApi exactly once, received ${capturedClientCalls.length}`,
    )
  }
  return capturedClientCalls[0]!
}

export const nonWebClientEndpointRegistry: Record<string, ManifestEndpoint> = {
  ...createNonWebMembershipEndpointRegistry(endpointFromClientHelper),
  'native.identity-verification-attempts.grant.default': endpointFromClientHelper(() =>
    grantIdentityVerificationAttempt(
      '00000000-0000-7000-8000-000000000003',
      'Provider terminal error reviewed by support.',
    ),
  ),
  'native.messages.conversations.default': endpointFromClientHelper(() => getMyMessagesClient()),
  'native.messages.conversations.page-2': endpointFromClientHelper(() =>
    getMyMessagesClient(
      'eyJ0aW1lc3RhbXAiOiIyMDI2LTA3LTAxVDA5OjE1OjAwLjAwMDAwMFoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDEwMiJ9',
      50,
    ),
  ),
  'native.messages.conversation.default': {
    method: 'GET',
    path: '/api/v1/my/messages/00000000-0000-7000-8000-000000000101',
  },
  'native.messages.create.default': endpointFromClientHelper(() =>
    createDirectConversation(['00000000-0000-7000-8000-000000000002']),
  ),
  'native.messages.thread.default': endpointFromClientHelper(() =>
    getDirectMessageThreadClient('00000000-0000-7000-8000-000000000101'),
  ),
  'native.messages.thread.page-2': endpointFromClientHelper(() =>
    getDirectMessageThreadClient('00000000-0000-7000-8000-000000000101', {
      after: 'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDIwMSJ9',
      limit: 50,
    }),
  ),
  'native.messages.send.default': endpointFromClientHelper(() =>
    sendDirectMessage('00000000-0000-7000-8000-000000000101', 'Sent from native'),
  ),
  'native.messages.participants.default': endpointFromClientHelper(() =>
    getConversationParticipantsClient('00000000-0000-7000-8000-000000000101'),
  ),
  'native.messages.participant-add.default': endpointFromClientHelper(() =>
    addConversationParticipant(
      '00000000-0000-7000-8000-000000000101',
      '00000000-0000-7000-8000-000000000003',
    ),
  ),
  'native.messages.participant-remove.default': endpointFromClientHelper(() =>
    removeConversationParticipant(
      '00000000-0000-7000-8000-000000000101',
      '00000000-0000-7000-8000-000000000002',
    ),
  ),
  'native.messages.policy.default': endpointFromClientHelper(() =>
    updateConversationParticipantPolicy('00000000-0000-7000-8000-000000000101', 'owner_only'),
  ),
  'native.messages.user-search.default': endpointFromClientHelper(() =>
    searchUsers({ q: 'bo', limit: 10 }),
  ),
  'native.users.followers.search': endpointFromClientHelper(() =>
    fetchFollowerUsers('user-abc', { limit: 25, q: 'al' }),
  ),
  'native.posts.followers.share': endpointFromClientHelper(() =>
    sharePostWithFollowers('post-abc'),
  ),
  'native.posts.followers.send-selected': endpointFromClientHelper(() =>
    sendPostToFollowers('post-abc', {
      audience: 'selected_followers',
      recipient_user_ids: ['01900000-0000-7000-8000-000000000502'],
    }),
  ),
  'native.rss-feed-items.followers.share': endpointFromClientHelper(() =>
    shareRssFeedItemWithFollowers('01900000-0000-7000-8000-000000000503'),
  ),
  'native.rss-feed-items.followers.send-selected': endpointFromClientHelper(() =>
    sendRssFeedItemToFollowers('01900000-0000-7000-8000-000000000503', {
      audience: 'selected_followers',
      recipient_user_ids: ['01900000-0000-7000-8000-000000000502'],
    }),
  ),
}
