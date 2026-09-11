import type { ApiFixtureCase } from './types.mts'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { AGENT_DIRECTORY_CURSOR_SCOPE, agentConversationListCursorScope } from '@modules/agents'

export const nativeAgentFixtureAgentId = '00000000-0000-7000-8000-000000000302'
export const nativeAgentFixtureSystemUserId = '00000000-0000-7000-8000-000000000001'
export const nativeAgentConversationListScope = agentConversationListCursorScope({
  agentSystemUserId: nativeAgentFixtureSystemUserId,
  onlyLinked: true,
})
const nativeAgentFilteredUsernameUserId = '00000000-0000-7000-8000-000000000011'
export const nativeAgentFilteredUsernameConversationScope = agentConversationListCursorScope({
  agentSystemUserId: nativeAgentFixtureSystemUserId,
  userId: nativeAgentFilteredUsernameUserId,
  onlyLinked: true,
})
const agentCursor = encodeScopedUuidCursor(
  '00000000-0000-7000-8000-000000000301',
  AGENT_DIRECTORY_CURSOR_SCOPE,
)
const conversationCursor = encodeScopedUuidCursor(
  '00000000-0000-7000-8000-000000001011',
  nativeAgentConversationListScope,
)
const filteredUsernameConversationCursor = encodeScopedUuidCursor(
  '00000000-0000-7000-8000-000000001021',
  nativeAgentFilteredUsernameConversationScope,
)
const consumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativeAgentListApiFixtureCases: ApiFixtureCase[] = [
  listCase(
    'native.agents.default',
    undefined,
    [agent('302', '001'), agent('301', '002')],
    true,
    agentCursor,
  ),
  listCase('native.agents.page-2', agentCursor, [agent('300', '003')], false, null),
  detailCase(),
  conversationCase(
    'native.agents.conversations.default',
    undefined,
    [conversation('012', null), conversation('011', '012')],
    true,
    conversationCursor,
  ),
  conversationCase(
    'native.agents.conversations.page-2',
    { after: conversationCursor },
    [conversation('010', '013')],
    false,
    null,
  ),
  conversationCase(
    'native.agents.conversations.filtered-username',
    { username: 'fixture-agent-user-011' },
    [conversation('022', '011'), conversation('021', '011')],
    true,
    filteredUsernameConversationCursor,
    nativeAgentFilteredUsernameConversationScope,
  ),
]

function detailCase(): ApiFixtureCase {
  const agentDetail = {
    ...agent('302', '001'),
    slug: 'helper',
    moderator: {
      agent_id: nativeAgentFixtureAgentId,
      created_at: '2026-07-01T10:00:00Z',
      updated_at: '2026-07-01T10:00:00Z',
    },
  }
  return {
    id: 'native.agents.detail.default',
    method: 'GET',
    path: '/api/v1/agents/helper',
    route: {
      routeTemplate: '/api/v1/agents/:idOrSlug',
      pathParams: { idOrSlug: 'helper' },
    },
    query: {},
    auth: 'fixture-admin',
    status: 200,
    consumers: [...consumers],
    migratedFrom: ['backend/api/v1/agents/agent.mts'],
    body: { agent: agentDetail, user: agentUser(agentDetail.system_user_id) },
  }
}

function listCase(
  id: string,
  after: string | undefined,
  results: ReturnType<typeof agent>[],
  hasNextPage: boolean,
  endCursor: string | null,
): ApiFixtureCase {
  return {
    id,
    method: 'GET',
    path: '/api/v1/agents',
    route: { routeTemplate: '/api/v1/agents' },
    query: { ...(after ? { after } : {}), limit: '2' },
    auth: 'fixture-admin',
    status: 200,
    consumers: [...consumers],
    migratedFrom: ['backend/api/v1/agents/agents.mts'],
    body: body(results, hasNextPage, endCursor, AGENT_DIRECTORY_CURSOR_SCOPE),
  }
}

function conversationCase(
  id: string,
  query: Record<string, string> | undefined,
  results: ReturnType<typeof conversation>[],
  hasNextPage: boolean,
  endCursor: string | null,
  cursorScope = nativeAgentConversationListScope,
): ApiFixtureCase {
  return {
    id,
    method: 'GET',
    path: '/api/v1/agents/helper/conversations',
    route: {
      routeTemplate: '/api/v1/agents/:idOrSlug/conversations',
      pathParams: { idOrSlug: 'helper' },
    },
    query: { ...query, limit: '2' },
    auth: 'fixture-admin',
    status: 200,
    consumers: [...consumers],
    migratedFrom: ['backend/api/v1/agents/agent-conversations.mts'],
    body: body(results, hasNextPage, endCursor, cursorScope),
  }
}

function agent(suffix: string, systemUserSuffix: string) {
  return {
    id: `00000000-0000-7000-8000-000000000${suffix}`,
    system_user_id: `00000000-0000-7000-8000-000000000${systemUserSuffix}`,
    agent_type: 'moderator',
    activated_at: '2026-07-01T10:00:00Z',
    deactivated_at: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    deleted_at: null,
  }
}

function conversation(suffix: string, creatorSuffix: string | null) {
  return {
    id: `00000000-0000-7000-8000-000000001${suffix}`,
    title: `Fixture conversation ${suffix}`,
    created_at: '2026-07-01T10:00:00Z',
    created_by_id:
      creatorSuffix === null ? null : `00000000-0000-7000-8000-000000000${creatorSuffix}`,
    updated_at: '2026-07-01T10:00:00Z',
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
  }
}

function body(
  results: Array<{ id: string; system_user_id?: string; created_by_id?: string | null }>,
  hasNextPage: boolean,
  endCursor: string | null,
  cursorScope: string,
) {
  const userIds = results.flatMap(result => {
    const userId = result.system_user_id ?? result.created_by_id
    return userId ? [userId] : []
  })
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: encodeScopedUuidCursor(results[0]!.id, cursorScope),
      end_cursor: endCursor,
    },
    users: Object.fromEntries(userIds.map(id => [id, agentUser(id)])),
  }
}

function agentUser(id: string) {
  const suffix = id.slice(-3)
  return {
    __entity_type: 'user',
    id,
    username: `fixture-agent-user-${suffix}`,
    roles: [],
    display_account: { id, name: `Fixture Agent User ${suffix}` },
  }
}
